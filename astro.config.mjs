// @ts-check
// Astro build config: static site output for GitHub Pages.
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Pages serves this from a project repo, not a <username>.github.io root, so the
// site lives under a base path. `site` and `base` keep canonical URLs and asset
// paths correct. Set base to '/' if it ever moves to a root repo.
export default defineConfig({
  site: 'https://samad-zeeshan.github.io',
  base: '/abdul-samad-zeeshan-portfolio',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    react(),
    mdx(),
    sitemap(),
  ],
  build: {
    // Emit page HTML as /path/index.html so links work without a server.
    format: 'directory',
  },
});
