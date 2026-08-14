# Identidade visual — GIRO

Estrutura como está no projeto:

```
C:\APPWEB\GIRO
├── app
│   ├── favicon.ico          gerado em 16/32/48/64/128/256px
│   ├── icon.svg             ícone do app (Next.js serve automaticamente)
│   ├── apple-icon.png       180x180, gerado por scripts/gerar-icones.mjs
│   ├── manifest.ts          instalação na tela inicial
│   └── globals.css          tokens da identidade
└── public
    ├── logo-giro.svg              assinatura horizontal, fundo claro
    ├── logo-giro-negativo.svg     assinatura horizontal, fundo escuro
    ├── simbolo-giro.svg           símbolo isolado, colorido
    ├── simbolo-giro-mono.svg      símbolo em currentColor
    ├── favicon.svg                versão reduzida, 7 traços
    ├── icon-192.png               PWA, gerado
    ├── icon-512.png               PWA, gerado
    └── preview-icon.png           só para conferência visual
```

> **Duas diferenças em relação ao pacote original.**
>
> `apple-icon` mudou de SVG para PNG e saiu de `public/` para `app/`. A
> convenção de arquivo do Next aceita apenas `.png`/`.jpg` nesse nome — um
> `apple-icon.svg` é ignorado em silêncio, sem erro — e o iOS também não
> renderiza SVG em ícone de tela inicial. `node scripts/gerar-icones.mjs`
> rasteriza o PNG a partir de `public/favicon.svg`; rode de novo se a marca
> mudar.
>
> `LEIA-ME.md` e `plano_mvp.md` foram para `docs/`. A raiz do projeto é código.

## Fonte

Adicione o Inter em `app/layout.tsx`:

```tsx
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
```

E aplique `inter.variable` na tag `<html>`. O `globals.css` já declara `--font-sans` com fallback para Segoe UI, então funciona mesmo antes disso.

## A regra que não pode ser quebrada

Verde, âmbar, coral e vermelho pertencem **exclusivamente** ao semáforo de conformidade. Nunca em botão, link, cabeçalho ou badge de navegação.

O motivo é operacional, não estético: o painel existe para que alguém bata o olho e saiba quem não pode trabalhar amanhã. Se o botão "Salvar" for verde, o verde deixa de significar "colaborador regular" e a tela vira ruído. Ações e navegação usam petróleo (`--color-brand`) e grafite (`--color-ink`).

Está escrito como comentário no topo do `globals.css` para que qualquer pessoa que abrir o arquivo veja antes de mexer.

## Classes prontas

Semáforo, alinhado com os valores da view `vw_status_colaborador`:

```html
<span class="status status--regular">Regular · 84 dias</span>
<span class="status status--programar">Programar · 47 dias</span>
<span class="status status--atencao">Atenção · 22 dias</span>
<span class="status status--critico">Crítico · 12 dias</span>
<span class="status status--vencido">Vencido</span>
<span class="status status--sem-registro">Sem registro</span>
```

`sem-registro` usa o mesmo tratamento de `vencido` de propósito. Ausência de informação tem o mesmo peso operacional que ASO vencido — nos dois casos o colaborador não sobe em poste amanhã.

Outras classes disponíveis: `.card`, `.banner-base`, `.btn` (`--primary`, `--secondary`), `.field`, `.label`, `.tabela`, `.dias-parados`, `.tabular`, `.sr-only`.

## Detalhes que já vieram resolvidos

- Botões e campos com altura mínima de 42px — o supervisor abre isso no celular, em campo, às vezes de luva.
- `tabular-nums` nas células de tabela, matrículas e datas, para os dígitos não dançarem entre linhas.
- `prefers-reduced-motion` respeitado.
- Foco visível por teclado em todos os controles.
- Apenas dois pesos de fonte, 400 e 500. Peso 600 ou 700 pesa demais numa tela de tabela densa.

## Limite do símbolo

Os doze traços fecham abaixo de 24px. O `favicon.svg` já é a variante reduzida, com sete traços e traço mais grosso, e é dele que sai o `.ico`. Não use `simbolo-giro.svg` em tamanhos pequenos.
