#!/usr/bin/env node
// Validates src/data/facts.json, the site's single source of truth, at build time.
//
// Nothing ships unless every skill, project, and evidence edge lines up. Exits
// non-zero on any violation so `npm run build` and CI fail loudly.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const factsPath = join(root, 'src', 'data', 'facts.json');
const projectsDir = join(root, 'src', 'content', 'projects');

const CATEGORIES = new Set(['ml', 'systems', 'web', 'infra']);

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const notes = [];

function fail(msg) {
  errors.push(msg);
}

// Site copy stays plain and human: no em-dashes and no complex punctuation
// (semicolons or colons). This applies to prose fields only, never URLs.
const BANNED_PUNCT = [
  ['—', 'em-dash'],
  [';', 'semicolon'],
  [':', 'colon'],
];
function checkCopy(str, where) {
  if (typeof str !== 'string') return;
  for (const [ch, name] of BANNED_PUNCT) {
    if (str.includes(ch)) fail(`${where} contains a ${name} (site copy stays plain)`);
  }
}

if (!existsSync(factsPath)) {
  console.error(`✗ facts.json not found at ${factsPath}`);
  process.exit(1);
}

/** @type {any} */
let facts;
try {
  facts = JSON.parse(readFileSync(factsPath, 'utf8'));
} catch (err) {
  console.error(`✗ facts.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

const skills = Array.isArray(facts.skills) ? facts.skills : null;
const projects = Array.isArray(facts.projects) ? facts.projects : null;
const edges = Array.isArray(facts.edges) ? facts.edges : null;

if (!skills) fail('facts.skills must be an array');
if (!projects) fail('facts.projects must be an array');
if (!edges) fail('facts.edges must be an array');

// Bail now if the top-level shape is wrong. The per-item checks below assume these are arrays.
if (errors.length) {
  report();
}

// --- skills: unique ids, valid category ----------------------------------
const skillIds = new Set();
for (const s of skills) {
  if (!s.id) fail(`a skill is missing an id: ${JSON.stringify(s)}`);
  else if (skillIds.has(s.id)) fail(`duplicate skill id: ${s.id}`);
  else skillIds.add(s.id);
  if (!s.label) fail(`skill "${s.id}" is missing a label`);
  if (!CATEGORIES.has(s.category))
    fail(`skill "${s.id}" has invalid category "${s.category}" (must be ml | systems | web | infra)`);
}

// --- projects: unique ids, repo, caseStudy, oneLiner ---------------------
const projectIds = new Set();
for (const p of projects) {
  if (!p.id) fail(`a project is missing an id: ${JSON.stringify(p)}`);
  else if (projectIds.has(p.id)) fail(`duplicate project id: ${p.id}`);
  else projectIds.add(p.id);
  if (!p.label) fail(`project "${p.id}" is missing a label`);
  if (typeof p.repo !== 'string' || !/^https:\/\/github\.com\//.test(p.repo))
    fail(`project "${p.id}" must have a GitHub repo URL (got ${JSON.stringify(p.repo)})`);
  if (typeof p.oneLiner !== 'string' || p.oneLiner.trim() === '')
    fail(`project "${p.id}" must have a non-empty oneLiner`);
  if (typeof p.caseStudy !== 'string' || p.caseStudy.trim() === '')
    fail(`project "${p.id}" must have a caseStudy path`);
  else if (p.caseStudy !== `/projects/${p.id}/`)
    fail(`project "${p.id}" caseStudy must be "/projects/${p.id}/" (got "${p.caseStudy}")`);
  checkCopy(p.oneLiner, `project "${p.id}" oneLiner`);
  // Metrics are optional, but when present every one must be a labelled,
  // non-empty, plainly-punctuated figure so the case-study Evidence table stays clean.
  if (p.metrics !== undefined) {
    if (!Array.isArray(p.metrics)) {
      fail(`project "${p.id}" metrics must be an array`);
    } else {
      for (const m of p.metrics) {
        if (typeof m.label !== 'string' || m.label.trim() === '')
          fail(`project "${p.id}" has a metric with an empty label`);
        if (typeof m.value !== 'string' || m.value.trim() === '')
          fail(`project "${p.id}" metric "${m.label}" has an empty value`);
        for (const field of ['label', 'value', 'note']) {
          checkCopy(m[field], `project "${p.id}" metric "${m.label}" ${field}`);
        }
      }
    }
  }
}

// --- edges: reference real skill + project, non-empty evidence -----------
const skillsWithEdge = new Set();
const projectsWithEdge = new Set();
const edgeKeys = new Set();
for (const e of edges) {
  const key = `${e.skill}::${e.project}`;
  if (edgeKeys.has(key)) fail(`duplicate edge ${key}`);
  edgeKeys.add(key);
  if (!skillIds.has(e.skill)) fail(`edge references unknown skill "${e.skill}"`);
  else skillsWithEdge.add(e.skill);
  if (!projectIds.has(e.project)) fail(`edge references unknown project "${e.project}"`);
  else projectsWithEdge.add(e.project);
  if (typeof e.evidence !== 'string' || e.evidence.trim() === '')
    fail(`edge ${key} has empty evidence`);
  checkCopy(e.evidence, `edge ${key} evidence`);
}

// --- profile prose stays plain too --------------------------------------
if (facts.profile) {
  checkCopy(facts.profile.intro, 'profile.intro');
  checkCopy(facts.profile.thesis, 'profile.thesis');
  checkCopy(facts.profile.headline, 'profile.headline');
}

// --- coverage: no unevidenced skill, no orphan project -------------------
for (const id of skillIds)
  if (!skillsWithEdge.has(id))
    fail(`skill "${id}" has no evidence edge, so it must not appear on the site`);
for (const id of projectIds)
  if (!projectsWithEdge.has(id)) fail(`project "${id}" has no edges`);

// --- each project has a case study MDX (once any exist) ------------------
let mdxFiles = [];
if (existsSync(projectsDir)) {
  mdxFiles = readdirSync(projectsDir).filter((f) => f.endsWith('.mdx'));
}
if (mdxFiles.length === 0) {
  notes.push('no case-study MDX files yet; skipping case-study presence check');
} else {
  const slugs = new Set(mdxFiles.map((f) => f.replace(/\.mdx$/, '')));
  for (const id of projectIds)
    if (!slugs.has(id))
      fail(`project "${id}" has no case study at src/content/projects/${id}.mdx`);
  for (const slug of slugs)
    if (!projectIds.has(slug))
      fail(`orphan case study src/content/projects/${slug}.mdx has no project in facts.json`);
  // Case-study prose stays plain too. Strip the frontmatter and any {/* ... */}
  // source-only comments, then check the rendered body.
  for (const f of mdxFiles) {
    const body = readFileSync(join(projectsDir, f), 'utf8')
      .replace(/^---[\s\S]*?---/, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const [ch, name] of BANNED_PUNCT) {
      if (body.includes(ch)) fail(`case study ${f} contains a ${name} (site copy stays plain)`);
    }
  }
}

report();

function report() {
  for (const n of notes) console.log(`ℹ ${n}`);
  if (errors.length) {
    console.error(`\n✗ facts.json failed validation (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `✓ facts.json valid: ${skills.length} skills, ${projects.length} projects, ${edges.length} evidence edges. Every skill is evidenced; every project has a repo and a case study.`,
  );
}
