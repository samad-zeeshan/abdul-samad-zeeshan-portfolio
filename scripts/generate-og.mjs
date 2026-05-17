#!/usr/bin/env node
// Generates the Open Graph images (1200x630) into public/og/, one per page.
//
// Text uses a system sans so renders stay stable across machines. Re-run with
// `npm run og` if facts change.

import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const facts = JSON.parse(readFileSync(join(root, 'src', 'data', 'facts.json'), 'utf8'));
const outDir = join(root, 'public', 'og');
mkdirSync(outDir, { recursive: true });

const CAT = { ml: '#5ac8d8', systems: '#7fc96f', web: '#ae9deb', infra: '#e88ab0' };
const CAT_ORDER = ['ml', 'systems', 'web', 'infra'];
const INK = '#0e1217';
const TEXT = '#e6eaf0';
const DIM = '#9ba6b4';
const FAINT = '#6b7684';
const SIGNAL = '#f2c14e';
const FONT = 'Segoe UI, -apple-system, Arial, sans-serif';
const MONO = 'Consolas, Menlo, monospace';

const W = 1200;
const H = 630;
const PAD = 84;

// These strings get interpolated straight into SVG markup, so escape XML specials first.
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Wraps by character count, not pixel width. We can't measure the system font here,
// so maxChars is tuned per call site to the font size used there.
function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function tspans(lines, x, startY, lineH) {
  return lines
    .map((l, i) => `<tspan x="${x}" y="${startY + i * lineH}">${esc(l)}</tspan>`)
    .join('');
}

function categoriesForProject(projectId) {
  const present = new Set();
  for (const e of facts.edges) {
    if (e.project === projectId) {
      const s = facts.skills.find((s) => s.id === e.skill);
      if (s) present.add(s.category);
    }
  }
  // Return in fixed channel order, not edge order, so the dots read the same on every card.
  return CAT_ORDER.filter((c) => present.has(c));
}

// The four-color strip across the top is the card's signature mark, one band per skill category.
function channelStrip() {
  const seg = W / 4;
  return CAT_ORDER.map(
    (c, i) => `<rect x="${i * seg}" y="0" width="${seg}" height="8" fill="${CAT[c]}"/>`,
  ).join('');
}

function dots(cats, x, y) {
  return cats
    .map((c, i) => `<circle cx="${x + i * 30}" cy="${y}" r="9" fill="${CAT[c]}"/>`)
    .join('');
}

function baseSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
  ${channelStrip()}
  <text x="${W - PAD}" y="${H - PAD + 6}" text-anchor="end" font-family="${MONO}" font-size="24" fill="${FAINT}">samad-zeeshan.github.io</text>
  ${inner}
</svg>`;
}

function homeSvg() {
  const title = wrap(facts.profile.thesis, 26);
  const inner = `
  <text x="${PAD}" y="${PAD + 26}" font-family="${MONO}" font-size="24" letter-spacing="3" fill="${FAINT}">${esc(facts.profile.role.toUpperCase())}</text>
  <text x="${PAD}" y="${PAD + 40}" font-family="${MONO}" font-size="24" fill="${SIGNAL}"> </text>
  <text x="${PAD}" y="0" font-family="${FONT}" font-size="82" font-weight="700" fill="${TEXT}" letter-spacing="-1">
    ${tspans([facts.profile.name], PAD, PAD + 130, 96)}
  </text>
  <text x="${PAD}" y="0" font-family="${FONT}" font-size="40" fill="${DIM}">
    ${tspans(title, PAD, PAD + 240, 56)}
  </text>
  ${dots(CAT_ORDER, PAD + 12, H - PAD)}
  <text x="${PAD + 12 + CAT_ORDER.length * 30 + 8}" y="${H - PAD + 8}" font-family="${MONO}" font-size="24" fill="${FAINT}">4 channels · evidence-first</text>`;
  return baseSvg(inner);
}

function projectSvg(p) {
  const cats = categoriesForProject(p.id);
  const one = wrap(p.oneLiner, 58).slice(0, 3);
  const metric = p.metrics && p.metrics[0];
  // Stack the metric below the wrapped one-liner: base offset plus one line-height per line.
  const metricY = PAD + 150 + one.length * 50 + 40;
  const inner = `
  <text x="${PAD}" y="${PAD + 26}" font-family="${MONO}" font-size="24" letter-spacing="3" fill="${FAINT}">CASE STUDY</text>
  <text x="${PAD}" y="0" font-family="${FONT}" font-size="92" font-weight="700" fill="${TEXT}" letter-spacing="-1">
    ${tspans([p.label], PAD, PAD + 118, 100)}
  </text>
  <text x="${PAD}" y="0" font-family="${FONT}" font-size="34" fill="${DIM}">
    ${tspans(one, PAD, PAD + 150 + 40, 50)}
  </text>
  ${
    metric
      ? `<text x="${PAD}" y="${metricY}" font-family="${MONO}" font-size="44" font-weight="600" fill="${CAT[cats[0]] || SIGNAL}">${esc(metric.value)}</text>
         <text x="${PAD}" y="${metricY + 34}" font-family="${MONO}" font-size="22" letter-spacing="1" fill="${FAINT}">${esc(metric.label.toUpperCase())}</text>`
      : ''
  }
  ${dots(cats, PAD + 12, H - PAD)}`;
  return baseSvg(inner);
}

async function render(name, svg) {
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, `${name}.png`));
  console.log(`  og/${name}.png`);
}

console.log('generating OG images...');
await render('home', homeSvg());
for (const p of facts.projects) {
  await render(p.id, projectSvg(p));
}
console.log('done');
