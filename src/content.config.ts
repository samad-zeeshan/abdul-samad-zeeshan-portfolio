// Content collection for the eight projects. Each entry's frontmatter holds the
// README text and numbers the pages render, so no page can invent a claim.
import { defineCollection } from 'astro:content';
import { z } from 'astro:schema';
import { glob } from 'astro/loaders';

const number = z.object({
  value: z.string(),
  label: z.string(),
  // Where the number was copied from, so a reviewer can check it against the repo.
  source: z.string(),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.mdx', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    order: z.number().int(),
    problem: z.string(),
    description: z.string().max(200),
    // A project still being built has no page, demo, GIF or numbers yet.
    status: z.enum(['shipped', 'in-progress']).default('shipped'),
    opener: z.string().optional(),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    demoNote: z.string().optional(),
    gif: z
      .object({ file: z.string(), width: z.number(), height: z.number(), alt: z.string() })
      .optional(),
    poster: z.string().optional(),
    // The demo's own palette, copied from its CSS tokens, so the page keeps its tone.
    tone: z
      .object({
        scheme: z.enum(['light', 'dark']),
        bg: z.string(),
        ink: z.string(),
        ink2: z.string(),
        accent: z.string(),
        line: z.string(),
      })
      .optional(),
    numbers: z.array(number).max(2).default([]),
    papers: z.array(z.string()).default([]),
  }),
});

export const collections = { projects };
