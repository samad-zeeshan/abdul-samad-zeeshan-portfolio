// Content collection for the MDX case studies. Sets how they load and what
// frontmatter is allowed.
import { defineCollection } from 'astro:content';
import { z } from 'astro:schema';
import { glob } from 'astro/loaders';

// The filename without .mdx is the entry id and must match a project id in
// facts.json (validate-facts.mjs enforces the pairing). Everything factual lives in
// facts.json, so frontmatter carries only the page title and meta description.
const projects = defineCollection({
  // The [^_] in the glob skips files whose name starts with an underscore, which are drafts.
  loader: glob({ pattern: '**/[^_]*.mdx', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    // Cap matches the meta description length search engines actually show.
    description: z.string().min(1).max(200),
  }),
});

export const collections = { projects };
