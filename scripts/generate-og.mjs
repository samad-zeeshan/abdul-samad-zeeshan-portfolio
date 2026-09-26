#!/usr/bin/env node
// Generates the 1200x630 share images into public/og/, one for home and one per project.
//
// Run with `npm run og` after changing a title or problem line. Uses system fonts,
// because sharp's SVG renderer cannot load the site's web fonts.

import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import YAML from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'og');
mkdirSync(outDir, { recursive: true });
const facts = JSON.parse(readFileSync(join(root, 'src', 'data', 'facts.json'), 'utf8'));

const FIELD = '#1f2ee8';
const CREAM = '#f4efe2';
const DISPLAY = 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif';
const TEXT = 'Segoe UI, Arial, sans-serif';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Wraps by character count. The system font cannot be measured here, so the width is
// tuned to the size used at each call site.
function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if ((line + ' ' + w).trim().length > max) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function card({ title, sub, bg, ink, band }) {
  const subLines = wrap(sub, 46).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${bg}"/>
  ${band ? `<rect width="1200" height="64" fill="${FIELD}"/><text x="72" y="42" font-family="${TEXT}" font-size="22" font-weight="600" fill="${CREAM}" letter-spacing="2">${esc(facts.name.toUpperCase())}</text>` : ''}
  <text x="64" y="${band ? 330 : 300}" font-family="${DISPLAY}" font-size="${title.length > 12 ? 150 : 220}" fill="${ink}">${esc(title.toUpperCase())}</text>
  ${subLines
    .map((l, i) => `<text x="72" y="${(band ? 410 : 390) + i * 46}" font-family="${TEXT}" font-size="34" fill="${ink}">${esc(l)}</text>`)
    .join('\n  ')}
</svg>`;
}

async function write(name, svg) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(join(outDir, `${name}.png`));
  console.log(`og: ${name}.png`);
}

await write('home', card({ title: 'Abdul Samad', sub: facts.role + '. Eight projects, each with a demo and its own numbers.', bg: FIELD, ink: CREAM }));

const dir = join(root, 'src', 'content', 'projects');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mdx'))) {
  const data = YAML.parse(readFileSync(join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---/)[1]);
  if (data.status === 'in-progress') continue;
  const id = f.replace(/\.mdx$/, '');
  await write(id, card({ title: data.title, sub: data.problem, bg: data.tone.bg, ink: data.tone.ink, band: true }));
}
