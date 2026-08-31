// Typed access to the skills graph in facts.json: which skill each shipped project
// proves, and the sentence from its README that proves it.
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

// Projects live in the content collection, so the graph gets just what it draws.
export interface GraphProject {
  id: string;
  label: string;
  href: string;
}

const graph = factsData.graph as { skills: Skill[]; edges: Edge[] };

export const skills = graph.skills;
export const edges = graph.edges;

export const CATEGORY_ORDER: Category[] = ['ml', 'systems', 'web', 'infra'];

export const CATEGORY_LABEL: Record<Category, string> = {
  ml: 'AI and ML',
  systems: 'Systems and data',
  web: 'Backend',
  infra: 'Infrastructure',
};

/** Skills grouped by category, each with the projects that back it in the order the
 *  projects are passed in, so the index keeps the home page's curation. */
export function skillsByCategory(projects: GraphProject[]) {
  const order = new Map(projects.map((p, i) => [p.id, i]));
  const byId = new Map(projects.map((p) => [p.id, p]));
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    skills: skills
      .filter((s) => s.category === category)
      .map((skill) => ({
        skill,
        projects: edges
          .filter((e) => e.skill === skill.id && byId.has(e.project))
          .sort((a, b) => order.get(a.project)! - order.get(b.project)!)
          .map((e) => ({ project: byId.get(e.project)!, evidence: e.evidence })),
      })),
  })).filter((g) => g.skills.length > 0);
}
