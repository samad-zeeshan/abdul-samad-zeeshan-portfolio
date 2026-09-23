// Profile data, the ordered project list, and the counts the home page shows.
import { getCollection, type CollectionEntry } from 'astro:content';
import facts from '../data/facts.json';
import copy from '../data/copy.json';

export const profile = facts;
export { copy };

export type Project = CollectionEntry<'projects'>;

// Hidden projects stay in the collection so the validator can count them, and are
// dropped here so the index and the rail never see them.
export async function getProjects(): Promise<Project[]> {
  const all = await getCollection('projects');
  return all.filter((p) => p.data.status !== 'hidden').sort((a, b) => a.data.order - b.data.order);
}

// Only shipped projects get a page.
export function hasPage(p: Project): boolean {
  return p.data.status === 'shipped';
}

// A value like "11,054" or "0.8179" can count up. "0 of 84" stays as written.
export function countTarget(value: string): string | undefined {
  return /^[\d,]+(\.\d+)?$/.test(value) ? value : undefined;
}

export type StatKey = keyof typeof copy.stats;
export interface Stat {
  key: StatKey;
  value: number;
  label: string;
}

// The hero rail. Counted from the entries, never typed, and scripts/validate-facts.mjs
// recounts them from the frontmatter and checks the built page against its own count.
export function siteStats(projects: Project[]): Stat[] {
  const shipped = projects.filter(hasPage);
  const numbers = shipped.flatMap((p) => p.data.numbers);
  const stats: Stat[] = [
    { key: 'projects', value: shipped.length, label: copy.stats.projects },
    { key: 'demos', value: shipped.filter((p) => p.data.demo).length, label: copy.stats.demos },
    { key: 'numbers', value: numbers.length, label: copy.stats.numbers },
    { key: 'bad', value: numbers.filter((n) => n.tone === 'bad').length, label: copy.stats.bad },
  ];
  // A zero here would read as a boast, so the cell goes rather than showing 0.
  return stats.filter((s) => s.key !== 'bad' || s.value > 0);
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// Eyebrows spell small counts out, as a report header would.
export function inWords(n: number): string {
  return WORDS[n] ?? String(n);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

// Fills {name} slots in an eyebrow template from copy.json.
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));
}
