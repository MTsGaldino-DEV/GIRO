// Baixa do SharePoint da DP as pastas dos colaboradores listados em
// data/mapa_sharepoint_211.csv, preservando a estrutura de subpastas.
//
// Abre o Edge (Playwright) para o login Microsoft; a sessão fica salva em
// %LOCALAPPDATA%\giro-sharepoint-sessao, então só pede login na primeira vez.
// Arquivos já baixados com o mesmo tamanho são pulados (pode rodar de novo).
//
// Uso: node scripts/baixar-sharepoint.mjs [--so 23555,23689] [--destino <pasta>]

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SITE = 'https://engelmigproject-my.sharepoint.com/personal/neiliane_armendane_engelmig_com_br'
const RAIZ =
  '/personal/neiliane_armendane_engelmig_com_br/Documents/From G Suite Drive/2 - DEPARTAMENTO PESSOAL/DOCUMENTOS DE EMPREGADOS - GC GVA/1 - GV ATIVOS'
const URL_LOGIN = `https://engelmigproject-my.sharepoint.com/shared?id=${encodeURIComponent(RAIZ)}`

const args = process.argv.slice(2)
const arg = (nome) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : undefined
}
const DESTINO =
  arg('--destino') ?? path.join(os.homedir(), 'OneDrive - ENGELMIG ENERGIA LTDA', 'Área de Trabalho', 'Colaboradores')
const SO = arg('--so')?.split(',').map((s) => s.trim())
const PERFIL = path.join(os.homedir(), 'AppData', 'Local', 'giro-sharepoint-sessao')
const MAPA = path.resolve('data/mapa_sharepoint_211.csv')
const RELATORIO = path.resolve('data/download_sharepoint_211.csv')
const PARALELO = 3

const log = (...m) => console.log(new Date().toLocaleTimeString('pt-BR'), ...m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

// Nome válido no Windows: sem <>:"/\|?* nem ponto/espaço no fim.
const nomeLocal = (n) => n.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || '_'

// Parâmetro alias @p evita problemas com %, # e aspas no caminho.
const alias = (caminho) => `@p='${encodeURIComponent(caminho.replace(/'/g, "''"))}'`

function lerMapa() {
  const linhas = fs.readFileSync(MAPA, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/)
  const cab = linhas.shift().split(';')
  return linhas.map((l) => Object.fromEntries(l.split(';').map((v, i) => [cab[i], v])))
}

async function pedir(request, url, { binario = false } = {}) {
  for (let tentativa = 1; ; tentativa++) {
    let res
    try {
      res = await request.get(url, {
        headers: binario ? {} : { Accept: 'application/json;odata=nometadata' },
        maxRedirects: 0,
        timeout: 300_000,
      })
    } catch (e) {
      // Queda de conexão (ECONNRESET, timeout): tenta de novo como um 503.
      if (tentativa >= 6) throw e
      log(`  ${e.message.split('\n')[0]}, tentando de novo…`)
      await espera(5000 * tentativa)
      continue
    }
    if (res.ok()) return binario ? res.body() : res.json()
    const status = res.status()
    if ((status === 429 || status === 503 || status >= 500) && tentativa < 6) {
      const seg = Number(res.headers()['retry-after']) || 5 * tentativa
      log(`  HTTP ${status}, aguardando ${seg}s…`)
      await espera(seg * 1000)
      continue
    }
    throw new Error(`HTTP ${status} em ${decodeURIComponent(url).slice(0, 200)}`)
  }
}

async function listar(request, caminho) {
  const url =
    `${SITE}/_api/web/GetFolderByServerRelativePath(decodedurl=@p)` +
    `?$expand=Folders,Files&$select=Folders/Name,Files/Name,Files/Length&${alias(caminho)}`
  return pedir(request, url)
}

// Baixa recursivamente uma pasta do SharePoint para uma pasta local.
async function baixarPasta(request, remoto, local, total) {
  const { Folders = [], Files = [] } = await listar(request, remoto)
  fs.mkdirSync(local, { recursive: true })
  for (const f of Files) {
    const destino = path.join(local, nomeLocal(f.Name))
    const tamanho = Number(f.Length)
    if (fs.existsSync(destino) && fs.statSync(destino).size === tamanho) {
      total.pulados++
      continue
    }
    const url = `${SITE}/_api/web/GetFileByServerRelativePath(decodedurl=@p)/$value?${alias(`${remoto}/${f.Name}`)}`
    const corpo = await pedir(request, url, { binario: true })
    fs.writeFileSync(destino, corpo)
    total.baixados++
    total.bytes += corpo.length
  }
  for (const d of Folders) {
    await baixarPasta(request, `${remoto}/${d.Name}`, path.join(local, nomeLocal(d.Name)), total)
  }
}

async function aguardarLogin(context) {
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(URL_LOGIN)
  log('Se a janela pedir, faça o login Microsoft. Aguardando até 15 min…')
  const limite = Date.now() + 15 * 60_000
  while (Date.now() < limite) {
    try {
      const res = await context.request.get(`${SITE}/_api/web/currentuser?$select=Title`, {
        headers: { Accept: 'application/json;odata=nometadata' },
        maxRedirects: 0,
      })
      if (res.ok()) {
        log(`Logado como ${(await res.json()).Title}.`)
        return
      }
    } catch {}
    await espera(3000)
  }
  throw new Error('Login não concluído em 15 minutos.')
}

async function main() {
  let mapa = lerMapa()
  if (SO) mapa = mapa.filter((r) => SO.includes(r.matricula))
  log(`${mapa.length} colaboradores; destino: ${DESTINO}`)

  const context = await chromium.launchPersistentContext(PERFIL, {
    channel: 'msedge',
    headless: false,
    acceptDownloads: true,
  })
  const resultados = []
  try {
    await aguardarLogin(context)

    let proximo = 0
    let feitos = 0
    const trabalhar = async () => {
      while (proximo < mapa.length) {
        const r = mapa[proximo++]
        const total = { baixados: 0, pulados: 0, bytes: 0 }
        let status = 'ok'
        let erro = ''
        if (!r.pasta_sharepoint) {
          status = 'sem_pasta'
        } else {
          try {
            await baixarPasta(context.request, `${RAIZ}/${r.pasta_sharepoint}`, path.join(DESTINO, nomeLocal(r.nome)), total)
          } catch (e) {
            status = 'erro'
            // Só a 1ª linha: o "Call log" do Playwright traz os cookies de sessão.
            erro = e.message.split('\n')[0]
          }
        }
        feitos++
        log(
          `[${feitos}/${mapa.length}] ${r.nome}: ${status}` +
            (status === 'sem_pasta' ? '' : ` — ${total.baixados} baixados, ${total.pulados} já existiam`) +
            (erro ? ` — ${erro}` : ''),
        )
        resultados.push({ ...r, status, ...total, erro })
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, trabalhar))
  } finally {
    await context.close()
    const cab = ['matricula', 'nome', 'pasta_sharepoint', 'status', 'baixados', 'pulados', 'bytes', 'erro']
    const linhas = resultados
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((r) => cab.map((c) => String(r[c] ?? '').replace(/;/g, ',')).join(';'))
    fs.writeFileSync(RELATORIO, '﻿' + [cab.join(';'), ...linhas].join('\r\n') + '\r\n')
    const soma = (k) => resultados.reduce((s, r) => s + (r[k] || 0), 0)
    const cont = (s) => resultados.filter((r) => r.status === s).length
    log(
      `Fim: ${cont('ok')} ok, ${cont('erro')} com erro, ${cont('sem_pasta')} sem pasta; ` +
        `${soma('baixados')} arquivos baixados (${(soma('bytes') / 1048576).toFixed(1)} MB), ${soma('pulados')} pulados. ` +
        `Relatório: ${RELATORIO}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
