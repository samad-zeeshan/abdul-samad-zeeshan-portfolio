#!/usr/bin/env node
// Rasterizes favicon.svg into the PNG icons browsers request (favicon-32,
// apple-touch-icon). Run with `npm run icons` if the mark changes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'favicon.svg'));
const pub = join(root, 'public');

// Rasterize the SVG at high DPI before downsizing so the small PNGs keep clean edges.
await sharp(svg, { density: 384 }).resize(32, 32).png().toFile(join(pub, 'favicon-32.png'));
await sharp(svg, { density: 384 }).resize(180, 180).png().toFile(join(pub, 'apple-touch-icon.png'));
console.log('icons: favicon-32.png, apple-touch-icon.png');
