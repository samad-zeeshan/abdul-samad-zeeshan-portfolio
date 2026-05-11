// Prefixes internal links and assets with the Pages base path. This is a project
// repo, so the site lives under a sub-path and root-relative links would 404 without it.

const BASE = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}
