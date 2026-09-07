// Profile data and the ordered project list, shared by every page.
import { getCollection, type CollectionEntry } from 'astro:content';
import facts from '../data/facts.json';

export const profile = facts;

export type Project = CollectionEntry<'projects'>;

// Hidden projects stay in the collection so the validator can count them, and are
// dropped here so the index, the rail and the graph never see them.
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
