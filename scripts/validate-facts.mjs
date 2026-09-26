#!/usr/bin/env node
// Checks the site's claims before every build and fails loudly on a violation.
//
// Eight projects exactly, the fact guards, no location, plain punctuation, and each
// README opener still matching its repo when the sibling clone is present.

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
  if (d.status === 'in-progress' && (d.demo || d.numbers?.length || d.gif)) {
    fail(`${e.id}: an in-progress project must not show a demo, GIF or numbers`);
  }
  if (d.status !== 'in-progress' && !d.opener) fail(`${e.id}: missing README opener`);
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

// Scan every file that renders text: content, data, pages, components, layouts.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}
const textFiles = walk(join(root, 'src')).filter((p) => /\.(astro|mdx|json|ts)$/.test(p));
const LOCATION = /\b(Edmonton|Alberta|Canada|Dubai|UAE|Emirates|relocat\w*)\b/i;
const BANNED = /\b(seamless\w*|powerful|cutting-edge|robust|comprehensive|leverag\w*|elevate)\b/i;
for (const p of textFiles) {
  const t = readFileSync(p, 'utf8');
  const rel = p.slice(root.length + 1);
  if (/[\u2014\u2013]/.test(t)) fail(`${rel}: contains an em or en dash`);
  if (LOCATION.test(t)) fail(`${rel}: mentions a location (${t.match(LOCATION)[0]})`);
  if (BANNED.test(t)) fail(`${rel}: uses "${t.match(BANNED)[0]}"`);
  if (/[\u200b-\u200f\u2060\ufeff]/.test(t)) fail(`${rel}: contains invisible Unicode`);
}

if (errors.length) {
  console.error(`validate-facts: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`validate-facts: ${entries.length} projects, ${textFiles.length} files checked`);
