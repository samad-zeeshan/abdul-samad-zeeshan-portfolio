// Typed access to the single source of truth. Everything factual on the site
// flows through here so a page can never invent a claim that is not in facts.json.
import factsData from '../data/facts.json';

export type Category = 'ml' | 'systems' | 'web' | 'infra';

export interface Skill {
  id: string;
  label: string;
  category: Category;
}

export interface Metric {
  label: string;
  value: string;
  note?: string;
}

export interface Demo {
  url: string;
  label: string;
}

export interface Project {
  id: string;
  label: string;
  year?: string;
  repo: string;
  demo?: Demo;
  oneLiner: string;
  caseStudy: string;
  metrics?: Metric[];
}

export interface Edge {
  skill: string;
  project: string;
  evidence: string;
}

export interface Profile {
  name: string;
  shortName: string;
  role: string;
  thesis: string;
  headline: string;
  intro: string;
  location: string;
  relocation: string;
  education: string;
  links: {
    github: string;
    linkedin: string;
    email: string;
    resume: string;
  };
}

interface Facts {
  profile: Profile;
  skills: Skill[];
  projects: Project[];
  edges: Edge[];
}

const facts = factsData as Facts;

export const profile = facts.profile;
export const skills = facts.skills;
export const projects = facts.projects;
export const edges = facts.edges;

export const CATEGORY_ORDER: Category[] = ['ml', 'systems', 'web', 'infra'];

export const CATEGORY_LABEL: Record<Category, string> = {
  ml: 'AI / ML',
  systems: 'Systems',
  web: 'Web / backend',
  infra: 'Infrastructure',
};

export function getSkill(id: string): Skill | undefined {
  return skills.find((s) => s.id === id);
}

export function getProject(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

// Edges are the source of truth for which skills a project has, so derive it from
// them rather than storing the list twice.
export function skillsForProject(projectId: string): Array<{ skill: Skill; evidence: string }> {
  return edges
    .filter((e) => e.project === projectId)
    // The non-null assertion is unsafe if an edge names a deleted skill, so drop those next.
    .map((e) => ({ skill: getSkill(e.skill)!, evidence: e.evidence }))
    .filter((x) => x.skill)
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.skill.category) - CATEGORY_ORDER.indexOf(b.skill.category) ||
        a.skill.label.localeCompare(b.skill.label),
    );
}

export function projectsForSkill(skillId: string): Array<{ project: Project; evidence: string }> {
  // Preserve facts.json's project order instead of alphabetizing, so the curation shows.
  const order = new Map(projects.map((p, i) => [p.id, i]));
  return edges
    .filter((e) => e.skill === skillId)
    .map((e) => ({ project: getProject(e.project)!, evidence: e.evidence }))
    .filter((x) => x.project)
    .sort((a, b) => (order.get(a.project.id) ?? 0) - (order.get(b.project.id) ?? 0));
}

/** Skills grouped by category, each with its evidencing projects. Drives the
 *  no-JS static index and is the data behind the graph. */
export function skillsByCategory(): Array<{
  category: Category;
  label: string;
  skills: Array<{ skill: Skill; projects: Array<{ project: Project; evidence: string }> }>;
}> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    skills: skills
      .filter((s) => s.category === category)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((skill) => ({ skill, projects: projectsForSkill(skill.id) })),
  })).filter((g) => g.skills.length > 0);
}

export function categoryCount(category: Category): number {
  return skills.filter((s) => s.category === category).length;
}

export function categoriesForProject(projectId: string): Category[] {
  const present = new Set(
    skillsForProject(projectId).map(({ skill }) => skill.category),
  );
  return CATEGORY_ORDER.filter((c) => present.has(c));
}

/** The category a project leans on most, for its accent rule. Ties break by
 *  canonical category order. */
export function leadCategory(projectId: string): Category {
  const counts = new Map<Category, number>();
  for (const { skill } of skillsForProject(projectId)) {
    counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
  }
  let best: Category = 'ml';
  let bestN = -1;
  for (const c of CATEGORY_ORDER) {
    const n = counts.get(c) ?? 0;
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

export function skillCountForProject(projectId: string): number {
  return edges.filter((e) => e.project === projectId).length;
}
