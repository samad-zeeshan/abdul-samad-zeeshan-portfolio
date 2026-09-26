#!/usr/bin/env node
// Checks the site's claims before every build and fails loudly on a violation.
//
// Eight projects exactly, the fact guards, no location, plain punctuation, plain words
// under a word cap, and each README opener still matching its repo when the sibling
// clone is present. With --built it also checks the hero counts in dist/ after a build.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import YAML from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'src', 'content', 'projects');
const errors = [];
const fail = (m) => errors.push(m);

const EXPECTED = ['warden', 'proving', 'tally', 'parley', 'tarn', 'triage', 'docket', 'bourse'];

// Where each repo lives next to this one on the owner's machine. The folder names are
// the old ones where a Windows lock kept the rename from landing. CI skips this check.
const SIBLINGS = {
  warden: ['Warden', 'Change-Gate'],
  proving: ['Proving'],
  tally: ['Tally'],
  parley: ['Parley', 'Majlis'],
  tarn: ['Tarn'],
  docket: ['Docket'],
};

const entries = readdirSync(contentDir)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const raw = readFileSync(join(contentDir, f), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---/);
    return { id: f.replace(/\.mdx$/, ''), raw, data: m ? YAML.parse(m[1]) : null };
  });

const ids = entries.map((e) => e.id).sort();
if (ids.join() !== [...EXPECTED].sort().join()) {
  fail(`projects must be exactly ${EXPECTED.join(', ')}. Found ${ids.join(', ')}`);
}

const orders = entries.map((e) => e.data?.order).sort((a, b) => a - b);
if (orders.join() !== '1,2,3,4,5,6,7,8') fail(`project order must run 1 to 8, got ${orders.join()}`);

for (const e of entries) {
  if (!e.data) {
    fail(`${e.id}: no frontmatter`);
    continue;
  }
  const d = e.data;
  const isShipped = !d.status || d.status === 'shipped';
  if (!isShipped && (d.demo || d.numbers?.length || d.gif)) {
    fail(`${e.id}: a project that is not shipped must not show a demo, GIF or numbers`);
  }
  if (isShipped && !d.opener) fail(`${e.id}: missing README opener`);
  if (d.gif && !existsSync(join(root, 'public', 'gifs', d.gif.file))) fail(`${e.id}: GIF file missing`);
  if (d.poster && !existsSync(join(root, 'public', 'posters', d.poster))) fail(`${e.id}: poster missing`);
  for (const n of d.numbers ?? []) {
    if (!n.source) fail(`${e.id}: number ${n.value} has no source`);
  }

  // Openers are quoted, so compare them word for word with the repo README.
  const dirs = SIBLINGS[e.id] ?? [];
  const readme = dirs.map((d2) => join(root, '..', d2, 'README.md')).find((p) => existsSync(p));
  if (readme && d.opener) {
    const text = readFileSync(readme, 'utf8').replace(/\s+/g, ' ');
    if (!text.includes(d.opener.replace(/\s+/g, ' '))) {
      fail(`${e.id}: opener no longer matches ${readme}`);
    }
  }
}

// Fact guards from the job-search profile. They apply to every public string.
const docket = entries.find((e) => e.id === 'docket');
if (docket && /\b(runs|running|operates|in production)\b/i.test(docket.raw)) {
  fail('docket: Docket never "runs" or "operates" in production');
}
const tarn = entries.find((e) => e.id === 'tarn');
if (tarn && /at scale/i.test(tarn.raw)) fail('tarn: Tarn is never "at scale"');

// The skills graph may only link skills to shipped projects, since any other has no
// numbers to back an edge and no page for the node to open.
const facts = JSON.parse(readFileSync(join(root, 'src', 'data', 'facts.json'), 'utf8'));
const graph = facts.graph ?? { skills: [], edges: [] };
const skillIds = new Set(graph.skills.map((s) => s.id));
const shipped = new Set(entries.filter((e) => (e.data?.status ?? 'shipped') === 'shipped').map((e) => e.id));
for (const edge of graph.edges) {
  if (!skillIds.has(edge.skill)) fail(`graph: edge names unknown skill ${edge.skill}`);
  if (!shipped.has(edge.project)) fail(`graph: edge to ${edge.project}, which is not a shipped project`);
  if (!edge.evidence) fail(`graph: ${edge.skill} to ${edge.project} has no evidence`);
}
for (const id of skillIds) {
  if (!graph.edges.some((e) => e.skill === id)) fail(`graph: skill ${id} has no evidence`);
}

// Scan every file that renders text: content, data, pages, components, layouts.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}
const textFiles = walk(join(root, 'src')).filter((p) => /\.(astro|mdx|json|tsx?)$/.test(p));
const LOCATION = /\b(Edmonton|Alberta|Canada|Dubai|UAE|Emirates|relocat\w*)\b/i;
const BANNED = /\b(seamless\w*|powerful|cutting-edge|robust|comprehensive|leverag\w*|elevate)\b/i;
for (const p of textFiles) {
  const t = readFileSync(p, 'utf8');
  const rel = p.slice(root.length + 1);
  if (/[\u2014\u2013]/.test(t)) fail(`${rel}: contains an em or en dash`);
  // The university name is allowed, it is a credential and not a place of residence.
  const noUni = t.replace(/University of Alberta/g, '');
  if (LOCATION.test(noUni)) fail(`${rel}: mentions a location (${noUni.match(LOCATION)[0]})`);
  if (BANNED.test(t)) fail(`${rel}: uses "${t.match(BANNED)[0]}"`);
  if (/[\u200b-\u200f\u2060\ufeff]/.test(t)) fail(`${rel}: contains invisible Unicode`);
}

// README vocabulary a stranger cannot read. Openers are exempt because they quote the
// README word for word, and number sources are exempt because they are an audit trail.
const JARGON = new RegExp(
  '\\b(hardened|boundary layers?|mcp|planted|adversarial|scenarios?|v1|v2|seeds?|seeded|' +
    'account-days?|point-in-time|resolvers?|parsers?|stacks?|grammar|held-out|precision|' +
    'recall|p95|p99|ece|lora|distill\\w*)\\b',
  'i',
);
// A word has a letter or digit in it, so the "/" separators in eyebrows do not count.
const words = (s) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
// Caps are "under N words", so N itself already fails.
function plain(where, text, cap) {
  if (typeof text !== 'string') return;
  const hit = text.match(JARGON);
  if (hit) fail(`${where}: uses README vocabulary "${hit[0]}"`);
  if (cap && words(text) >= cap) fail(`${where}: ${words(text)} words, must be under ${cap}`);
}
for (const e of entries) {
  const d = e.data;
  if (!d || d.status === 'hidden') continue;
  plain(`${e.id} problem`, d.problem, 24);
  plain(`${e.id} demoNote`, d.demoNote);
  (d.numbers ?? []).forEach((n, i) => {
    const where = `${e.id} number ${i + 1}`;
    plain(`${where} label`, n.label, 25);
    if (d.status === 'shipped' || !d.status) {
      if (!n.verdict) fail(`${where}: needs a verdict word`);
      if (!['good', 'bad', 'neutral'].includes(n.tone)) fail(`${where}: tone must be good, bad or neutral`);
    }
    if (n.verdict) {
      plain(`${where} verdict`, n.verdict, 5);
      if (n.verdict !== n.verdict.toLowerCase()) fail(`${where}: verdict must be lowercase`);
      // The verdict is lifted from the label, so at least one real word of it must
      // appear there. A five-letter stem lets "invented" match "inventing".
      const label = n.label.toLowerCase();
      const anchored = n.verdict
        .split(/\s+/)
        .filter((w) => w.length >= 4 || /\d/.test(w))
        .some((w) => label.includes(w.slice(0, 5)));
      if (!anchored) fail(`${where}: verdict "${n.verdict}" does not come from its label`);
    }
  });
  (d.decisions ?? []).forEach((s, i) => plain(`${e.id} decision ${i + 1}`, s, 30));
  if ((d.status ?? 'shipped') === 'shipped') {
    const n = d.decisions?.length ?? 0;
    if (n < 1 || n > 3) fail(`${e.id}: needs 1 to 3 decisions, has ${n}`);
    if (d.gif) {
      const clip = d.gif.file.replace(/\.gif$/, '');
      if (!existsSync(join(root, 'public', 'videos', `${clip}.mp4`))) fail(`${e.id}: demo video missing`);
    }
  }
}
for (const edge of graph.edges) plain(`graph ${edge.skill} to ${edge.project}`, edge.evidence, 25);

// Every string in copy.json is shown to strangers. Eyebrows are labels, so they get
// the tightest cap. Slots like {count} are filled with a stand-in before counting.
const copy = JSON.parse(readFileSync(join(root, 'src', 'data', 'copy.json'), 'utf8'));
const filled = (t) => t.replace(/\{\w+\}/g, '7');
for (const [k, t] of Object.entries(copy.eyebrows)) plain(`eyebrow ${k}`, filled(t), 10);
for (const [k, t] of Object.entries(copy.stats)) plain(`stat label ${k}`, t, 6);
plain('footer note', copy.footer.note, 25);
copy.footer.nav.forEach((t, i) => plain(`footer nav ${i + 1}`, t, 4));
Object.entries(copy.pill).forEach(([k, t]) => plain(`pill ${k}`, t, 4));
plain('follower disc', copy.follower.disc, 3);

// The hero rail, counted the same way src/lib/site.ts counts it.
const shippedEntries = entries.filter((e) => e.data && (e.data.status ?? 'shipped') === 'shipped');
const allNumbers = shippedEntries.flatMap((e) => e.data.numbers ?? []);
const stats = {
  projects: shippedEntries.length,
  demos: shippedEntries.filter((e) => e.data.demo).length,
  numbers: allNumbers.length,
  bad: allNumbers.filter((n) => n.tone === 'bad').length,
};

// The verdict face is for verdicts and two set lines only. Any other rule that sets
// it fails, so the second face cannot creep into body text.
const SERIF_OK = ['.verdict', '.role__tail', '.about__tail'];
for (const p of walk(join(root, 'src')).filter((f) => /\.(astro|css)$/.test(f))) {
  const rel = p.slice(root.length + 1);
  const t = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, sel, body] of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/var\(--font-verdict\)|Instrument Serif/.test(body)) continue;
    const selector = sel.trim();
    if (selector.startsWith('@font-face') || selector === ':root') continue;
    const bad = selector.split(',').map((x) => x.trim()).filter((x) => !SERIF_OK.some((c) => x.endsWith(c)));
    if (bad.length) fail(`${rel}: "${bad.join(', ')}" sets the verdict face`);
  }
}

// Leftovers from the removed picker and glow must not come back.
const LEFTOVER = /PalettePicker|bg-glow/;
for (const p of [...walk(join(root, 'src')), join(root, 'package.json')]) {
  const t = readFileSync(p, 'utf8');
  if (LEFTOVER.test(t)) fail(`${p.slice(root.length + 1)}: references "${t.match(LEFTOVER)[0]}"`);
}

// After a build, the rendered rail must show exactly these counts.
if (process.argv.includes('--built')) {
  const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
  const shown = Object.fromEntries(
    [...html.matchAll(/data-stat="(\w+)"[^>]*data-value="(\d+)"/g)].map((m) => [m[1], Number(m[2])]),
  );
  const want = { ...stats };
  if (want.bad === 0) delete want.bad;
  if (JSON.stringify(shown) !== JSON.stringify(want)) {
    fail(`home stat rail shows ${JSON.stringify(shown)}, content counts ${JSON.stringify(want)}`);
  }
}

// The header links here, so a missing file would ship a dead link.
if (!existsSync(join(root, 'public', 'resume.pdf'))) fail('public/resume.pdf is missing');

if (errors.length) {
  console.error(`validate-facts: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `validate-facts: ${entries.length} projects, ${textFiles.length} files checked, stats ${JSON.stringify(stats)}` +
    (process.argv.includes('--built') ? ', built page matches' : ''),
);
