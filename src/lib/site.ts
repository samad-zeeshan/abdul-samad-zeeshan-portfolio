// Profile data and the ordered project list, shared by every page.
import { getCollection, type CollectionEntry } from 'astro:content';
import facts from '../data/facts.json';

export const profile = facts;

export type Project = CollectionEntry<'projects'>;

export async function getProjects(): Promise<Project[]> {
  const all = await getCollection('projects');
  return all.sort((a, b) => a.data.order - b.data.order);
}

// Only shipped projects get a page. Bourse has nothing to show yet.
export function hasPage(p: Project): boolean {
  return p.data.status === 'shipped';
}

// A value like "11,054" or "0.8179" can count up. "0 of 84" stays as written.
export function countTarget(value: string): string | undefined {
  return /^[\d,]+(\.\d+)?$/.test(value) ? value : undefined;
}
