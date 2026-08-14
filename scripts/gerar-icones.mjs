// Rasteriza os ícones que precisam ser bitmap.
//
//   node scripts/gerar-icones.mjs
//
// O Next serve automaticamente app/icon.svg e app/favicon.ico, mas a convenção
// `apple-icon` aceita apenas .png/.jpg — um app/apple-icon.svg é ignorado em
// silêncio, e o iOS também não renderiza SVG em ícone de tela inicial. Daí o
// PNG.
//
// A origem é public/favicon.svg: a variante reduzida de sete traços. O símbolo
// de doze traços fecha abaixo de 24px e não serve para tamanho pequeno.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origem = path.join(raiz, "public", "favicon.svg");

if (!fs.existsSync(origem)) {
  console.error(`Origem não encontrada: ${origem}`);
  process.exit(1);
}

const svg = fs.readFileSync(origem);

const saidas = [
  // 180x180 é o tamanho que o iOS pede desde o iPhone 6 Plus.
  { arquivo: path.join(raiz, "app", "apple-icon.png"), tamanho: 180 },
  // Ícones de PWA, caso o painel vire atalho na tela inicial do supervisor.
  { arquivo: path.join(raiz, "public", "icon-192.png"), tamanho: 192 },
  { arquivo: path.join(raiz, "public", "icon-512.png"), tamanho: 512 },
];

for (const { arquivo, tamanho } of saidas) {
  await sharp(svg, { density: 384 })
    .resize(tamanho, tamanho, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(arquivo);
  console.log(`  ${path.relative(raiz, arquivo)}  ${tamanho}x${tamanho}`);
}

console.log("\nÍcones gerados.");
