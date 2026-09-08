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

// Only papers the README cites beside a design choice, each with what it changed.
const paper = z.object({
  id: z.string().regex(/^\d{4}\.\d{5}$/),
  title: z.string(),
  change: z.string(),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/[^_]*.mdx', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    order: z.number().int(),
    problem: z.string(),
    description: z.string().max(200),
    // A project still being built has no page, demo, GIF or numbers yet. A hidden one
    // is left off every page but still counts toward the eight the validator expects.
    status: z.enum(['shipped', 'in-progress', 'hidden']).default('shipped'),
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
    // Calls I made and bugs I chased, each sourced from the README.
    decisions: z.array(z.string()).max(3).default([]),
    papers: z.array(paper).max(3).default([]),
  }),
});

export const collections = { projects };
