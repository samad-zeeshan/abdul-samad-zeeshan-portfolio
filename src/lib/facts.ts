// Which skills each shipped project proves, with the sentence from its README that proves it.
import factsData from '../data/facts.json';

export type Category = 'ml' | 'systems' | 'web' | 'infra';

export interface Skill {
  id: string;
  label: string;
  category: Category;
}

export interface Edge {
  skill: string;
  project: string;
  evidence: string;
}

const graph = factsData.graph as { skills: Skill[]; edges: Edge[] };

export const skills = graph.skills;
export const edges = graph.edges;

export const CATEGORY_ORDER: Category[] = ['ml', 'systems', 'web', 'infra'];

export const CATEGORY_LABEL: Record<Category, string> = {
  ml: 'AI / ML',
  systems: 'Systems',
  web: 'Web / backend',
  infra: 'Infrastructure',
};

/** One project's skills, grouped by category in the fixed order and, inside a group,
 *  in the order facts.json lists the skills. Empty groups are dropped. */
export function provesFor(projectId: string) {
  const mine = new Map(edges.filter((e) => e.project === projectId).map((e) => [e.skill, e.evidence]));
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    rows: skills
      .filter((s) => s.category === category && mine.has(s.id))
      .map((s) => ({ skill: s, evidence: mine.get(s.id)! })),
  })).filter((g) => g.rows.length > 0);
}
