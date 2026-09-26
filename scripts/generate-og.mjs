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
const copy = JSON.parse(readFileSync(join(root, 'src', 'data', 'copy.json'), 'utf8'));

// The site's own field and accent, so a shared link previews what a visitor sees.
const FIELD = '#121214';
const CREAM = '#f1eee6';
const ACCENT = '#ff5c2a';
const DISPLAY = 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif';
const TEXT = 'Segoe UI, Arial, sans-serif';
const MONO = 'Consolas, Menlo, monospace';
// Stands in for the italic verdict face, which sharp cannot load either.
const SERIF = 'Georgia, Times New Roman, serif';
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pad2 = (n) => String(n).padStart(2, '0');
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

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

// Eyebrow over the title, and on project cards the lead number with its verdict at
// the foot, which is the site's report layout at share size.
function card({ title, sub, bg, ink, titleInk = ink, band, eyebrow, lead, leadInk = ink }) {
  const subLines = wrap(sub, 46).slice(0, 4);
  const top = band ? 64 : 0;
  const foot = lead
    ? `<text x="72" y="592" font-family="${MONO}" font-size="56" fill="${leadInk}">${esc(lead.value)}<tspan dx="24" font-family="${SERIF}" font-style="italic" font-size="44" fill="${ink}">${esc(lead.verdict ?? '')}</tspan></text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${bg}"/>
  ${band ? `<rect width="1200" height="64" fill="${FIELD}"/><text x="72" y="42" font-family="${TEXT}" font-size="22" font-weight="600" fill="${ACCENT}" letter-spacing="2">${esc(facts.name.toUpperCase())}</text>` : ''}
  <text x="72" y="${top + 64}" font-family="${MONO}" font-size="22" fill="${ink}" fill-opacity="0.7" letter-spacing="3">${esc(eyebrow.toUpperCase())}</text>
  <text x="64" y="${top + (band ? 236 : 260)}" font-family="${DISPLAY}" font-size="${title.length > 9 ? 150 : 200}" fill="${titleInk}">${esc(title.toUpperCase())}</text>
  ${subLines
    .map((l, i) => `<text x="72" y="${top + (band ? 310 : 350) + i * 46}" font-family="${TEXT}" font-size="34" fill="${ink}">${esc(l)}</text>`)
    .join('\n  ')}
  ${foot}
</svg>`;
}

async function write(name, svg) {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(join(outDir, `${name}.png`));
  console.log(`og: ${name}.png`);
}

const dir = join(root, 'src', 'content', 'projects');
const shipped = readdirSync(dir)
  .filter((x) => x.endsWith('.mdx'))
  .map((f) => ({
    id: f.replace(/\.mdx$/, ''),
    data: YAML.parse(readFileSync(join(dir, f), 'utf8').match(/^---\n([\s\S]*?)\n---/)[1]),
  }))
  .filter((p) => !p.data.status || p.data.status === 'shipped')
  .sort((a, b) => a.data.order - b.data.order);

await write(
  'home',
  card({
    title: 'Abdul Samad',
    sub: facts.role + '. Seven projects, each with a demo and its own numbers.',
    bg: FIELD,
    ink: CREAM,
    titleInk: ACCENT,
    eyebrow: fill(copy.eyebrows.hero, { count: WORDS[shipped.length] ?? shipped.length }),
  }),
);

for (const [i, { id, data }] of shipped.entries()) {
  await write(
    id,
    card({
      title: data.title,
      sub: data.problem,
      bg: data.tone.bg,
      ink: data.tone.ink,
      band: true,
      eyebrow: fill(copy.eyebrows.project, { index: pad2(i + 1), total: pad2(shipped.length) }),
      lead: data.numbers?.[0],
      leadInk: data.tone.accent,
    }),
  );
}
