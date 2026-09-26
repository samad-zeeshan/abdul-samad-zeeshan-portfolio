// Skills graph: skills clustered by category and linked to the shipped projects that
// prove them, settled with d3-force and drawn to a transparent canvas on the field.
import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import type { Skill, Edge, Category, GraphProject } from '../lib/facts';

const CATS: Category[] = ['ml', 'systems', 'web', 'infra'];
const CAT_LABEL: Record<Category, string> = {
  ml: 'AI and ML',
  systems: 'Systems and data',
  web: 'Backend',
  infra: 'Infrastructure',
};
// Four tints of the ink, strongest for the largest cluster, so the graph stays in one
// colour and the accent is left for projects and the active path.
const CAT_ALPHA: Record<Category, number> = { ml: 1, systems: 0.78, web: 0.6, infra: 0.46 };

interface Palette {
  ink: string;
  ink2: string;
  accent: string;
  field: string;
  display: string;
  text: string;
}

// Read once at mount and again when the palette attribute changes. Reading per frame
// would force a style recalc on every tick.
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--cream', '#f6f2e6'),
    ink2: v('--cream-2', '#cfd2f6'),
    accent: v('--accent', '#ffd84d'),
    field: v('--field', '#0a0a0a'),
    display: v('--font-display', 'sans-serif'),
    text: v('--font-text', 'sans-serif'),
  };
}

interface Props {
  skills: Skill[];
  projects: GraphProject[];
  edges: Edge[];
}

interface GNode {
  id: string;
  kind: 'skill' | 'project';
  label: string;
  category?: Category;
  href?: string;
  r: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}
interface GLink {
  source: GNode | string;
  target: GNode | string;
}

export default function EvidenceGraph({ skills, projects, edges }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Refs, not state: the tick loop mutates these every frame and must never re-render.
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const rafRef = useRef(0);
  const transformRef = useRef({ s: 1, ox: 0, oy: 0 });
  const paletteRef = useRef<Palette | null>(null);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [paletteTick, setPaletteTick] = useState(0);

  const { nodes, links, adjacency, byId } = useMemo(() => {
    const used = new Set(edges.map((e) => e.project));
    const nodes: GNode[] = [
      ...projects
        .filter((p) => used.has(p.id))
        .map((p) => ({ id: p.id, kind: 'project' as const, label: p.label, href: p.href, r: 4.5, x: 0, y: 0 })),
      ...skills.map((s) => ({ id: s.id, kind: 'skill' as const, label: s.label, category: s.category, r: 2.6, x: 0, y: 0 })),
    ];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const kept = edges.filter((e) => byId.has(e.skill) && byId.has(e.project));
    const links: GLink[] = kept.map((e) => ({ source: e.skill, target: e.project }));
    const adjacency = new Map<string, Set<string>>();
    for (const e of kept) {
      if (!adjacency.has(e.skill)) adjacency.set(e.skill, new Set());
      if (!adjacency.has(e.project)) adjacency.set(e.project, new Set());
      adjacency.get(e.skill)!.add(e.project);
      adjacency.get(e.project)!.add(e.skill);
    }
    return { nodes, links, adjacency, byId };
  }, [skills, projects, edges]);

  const activeId = pickedId ?? focusId ?? hoverId;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pal = (paletteRef.current ??= readPalette());
    // At least 2x so hairlines and small text stay crisp on a 1x screen, capped at 3x.
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const w = Math.round(cw * dpr);
    const h = Math.round(ch * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // Fit the settled layout into the box. Extra room on the right is for project labels.
    const padX = 18;
    const padY = 26;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    const labelRoom = 56;
    const s = Math.min((cw - 2 * padX - labelRoom) / Math.max(maxX - minX, 1), (ch - 2 * padY) / Math.max(maxY - minY, 1), 2.2);
    const ox = padX + (cw - 2 * padX - labelRoom - (maxX - minX) * s) / 2 - minX * s;
    const oy = ch / 2 - ((minY + maxY) / 2) * s;
    transformRef.current = { s, ox, oy };
    const sx = (n: GNode) => n.x * s + ox;
    const sy = (n: GNode) => n.y * s + oy;

    const active = activeId;
    const near = active ? adjacency.get(active) : undefined;
    const lit = (id: string) => !active || id === active || (near?.has(id) ?? false);
    const tint = (n: GNode) => (n.category ? rgba(pal.ink, CAT_ALPHA[n.category]) : pal.ink);

    for (const l of links) {
      const a = l.source as GNode;
      const b = l.target as GNode;
      const on = active && (a.id === active || b.id === active);
      ctx.strokeStyle = on ? pal.accent : rgba(pal.ink, active ? 0.08 : 0.22);
      ctx.lineWidth = on ? 1 : 0.6;
      ctx.beginPath();
      ctx.moveTo(sx(a), sy(a));
      ctx.lineTo(sx(b), sy(b));
      ctx.stroke();
    }

    for (const n of nodes) {
      const x = sx(n);
      const y = sy(n);
      ctx.globalAlpha = lit(n.id) ? 1 : 0.25;
      if (n.kind === 'project') {
        ctx.fillStyle = pal.accent;
        ctx.fillRect(x - n.r, y - n.r, n.r * 2, n.r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, n.id === active ? n.r + 1.2 : n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.id === active ? pal.accent : tint(n);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Idle shows project names only. With a node active, show it and its neighbours and
    // skip any label that would land on one already placed.
    ctx.textBaseline = 'middle';
    const placed: Array<[number, number, number, number]> = [];
    const hits = (r: [number, number, number, number]) =>
      placed.some((p) => r[0] < p[0] + p[2] && r[0] + r[2] > p[0] && r[1] < p[1] + p[3] && r[1] + r[3] > p[1]);
    const labelled = nodes
      .filter((n) => (active ? lit(n.id) : n.kind === 'project'))
      .sort((a, b) => rank(a, active) - rank(b, active));
    for (const n of labelled) {
      const x = sx(n);
      const y = sy(n);
      ctx.font = n.kind === 'project' ? `800 15px ${pal.display}` : `500 11.5px ${pal.text}`;
      const label = n.kind === 'project' ? n.label.toUpperCase() : n.label;
      const tw = ctx.measureText(label).width;
      const lh = n.kind === 'project' ? 16 : 14;
      const gap = n.r + 5;
      const spots: Array<[number, number]> = [
        [x + gap, y],
        [x - gap - tw, y],
        [x + gap, y - lh],
        [x + gap, y + lh],
        [x - gap - tw, y - lh],
        [x - gap - tw, y + lh],
      ];
      const inside = spots.filter(([tx]) => tx >= 2 && tx + tw <= cw - 2);
      // Project names always show. When every spot collides they take the first one.
      const spot =
        inside.find(([tx, ty]) => n.id === active || !hits([tx - 2, ty - lh / 2, tw + 4, lh])) ??
        (n.kind === 'project' ? inside[0] : undefined);
      if (!spot) continue;
      placed.push([spot[0] - 2, spot[1] - lh / 2, tw + 4, lh]);
      ctx.fillStyle = n.kind === 'project' || n.id === active ? pal.ink : pal.ink2;
      // A halo in the field colour keeps names readable where they cross lines.
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pal.field;
      ctx.strokeText(label, spot[0], spot[1] + 0.5);
      ctx.fillText(label, spot[0], spot[1] + 0.5);
    }

    // Keyboard focus ring, drawn here because the focused button is visually hidden.
    if (focusId) {
      const n = byId.get(focusId);
      if (n) {
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(sx(n), sy(n), n.r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, adjacency, byId, activeId, focusId, paletteTick]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const wrap = wrapRef.current;
    const aspect = wrap ? Math.max(0.8, Math.min(2.4, wrap.clientWidth / Math.max(wrap.clientHeight, 1))) : 1.4;
    // Projects are pinned on an ellipse that fills the box, and skills settle between
    // the projects that prove them. Free-floating projects bunched in the middle and
    // hid each other's names.
    const pinned = nodes.filter((n) => n.kind === 'project');
    pinned.forEach((n, i) => {
      const a = -Math.PI / 2 + (i / pinned.length) * Math.PI * 2;
      n.fx = n.x = Math.cos(a) * 150 * aspect;
      n.fy = n.y = Math.sin(a) * 120;
    });
    const sim = forceSimulation<GNode>(nodes)
      .force('charge', forceManyBody<GNode>().strength(-40).distanceMax(200))
      .force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance(40).strength(0.35))
      .force('collide', forceCollide<GNode>().radius((d) => (d.kind === 'project' ? 14 : 8)).strength(0.9))
      .force('x', forceX<GNode>(0).strength(0.02))
      .force('y', forceY<GNode>(0).strength(0.02))
      .alphaMin(0.004)
      .alphaDecay(0.024)
      .velocityDecay(0.45)
      .stop();
    simRef.current = sim;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Settle off screen and paint only the final frame.
      while (sim.alpha() > sim.alphaMin()) sim.tick();
      drawRef.current();
    } else {
      const loop = () => {
        sim.tick();
        drawRef.current();
        if (sim.alpha() > sim.alphaMin()) rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }
    // Canvas text falls back to a system face until the web fonts land.
    document.fonts?.ready.then(() => drawRef.current());
    return () => {
      cancelAnimationFrame(rafRef.current);
      sim.stop();
    };
  }, [nodes, links]);

  // The picker flips data-palette on <html>. Re-read the tokens and repaint once.
  useEffect(() => {
    const repaint = () => {
      paletteRef.current = readPalette();
      setPaletteTick((t) => t + 1);
    };
    const mo = new MutationObserver(repaint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', repaint);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', repaint);
    };
  }, []);

  // Interaction and palette changes repaint the settled frame. While the settle is
  // still running the loop already draws every frame.
  useEffect(() => {
    const sim = simRef.current;
    if (sim && sim.alpha() <= sim.alphaMin()) draw();
  }, [draw]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodeAt = (clientX: number, clientY: number): GNode | null => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const { s, ox, oy } = transformRef.current;
    let best: GNode | null = null;
    let bestD = Infinity;
    for (const n of nodes) {
      const dx = n.x * s + ox - px;
      const dy = n.y * s + oy - py;
      const d = dx * dx + dy * dy;
      // Small dots get a finger-sized target.
      const hit = n.kind === 'project' ? 16 : 12;
      if (d < hit * hit && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') return;
    const n = nodeAt(e.clientX, e.clientY);
    setHoverId(n ? n.id : null);
    e.currentTarget.style.cursor = n ? 'pointer' : 'default';
  };
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const n = nodeAt(e.clientX, e.clientY);
    if (n?.kind === 'project' && n.href) {
      window.location.href = n.href;
      return;
    }
    // A tap on a skill holds its highlight, since touch has no hover.
    setPickedId(n && n.id !== pickedId ? n.id : null);
  };

  const active = activeId ? byId.get(activeId) : null;
  const activeProjects = active
    ? [...(adjacency.get(active.id) ?? [])].map((id) => byId.get(id)!.label)
    : [];

  return (
    <div className="eg" onKeyDown={(e) => e.key === 'Escape' && setPickedId(null)}>
      <div className="eg__wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="eg__canvas"
          aria-hidden="true"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverId(null)}
          onClick={onClick}
        ></canvas>
        <ul className="visually-hidden" aria-label="Skills graph">
          {nodes.map((n) => (
            <li key={n.id}>
              {n.kind === 'project' ? (
                <a href={n.href} onFocus={() => setFocusId(n.id)} onBlur={() => setFocusId(null)}>
                  Project {n.label}, {adjacency.get(n.id)?.size ?? 0} skills
                </a>
              ) : (
                <button type="button" onFocus={() => setFocusId(n.id)} onBlur={() => setFocusId(null)}>
                  {n.label}, {n.category ? CAT_LABEL[n.category] : ''}, proven by{' '}
                  {[...(adjacency.get(n.id) ?? [])].map((id) => byId.get(id)!.label).join(', ')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="eg__now label" aria-live="polite">
        {active ? (
          active.kind === 'skill' ? (
            <>
              <span className="eg__now-name">{active.label}</span> {activeProjects.join(', ')}
            </>
          ) : (
            <>
              <span className="eg__now-name">{active.label}</span> {activeProjects.length} skills. Click to open.
            </>
          )
        ) : (
          CATS.map((c) => (
            <span key={c} className="eg__key">
              <span className="eg__dot" style={{ opacity: CAT_ALPHA[c] }} aria-hidden="true"></span>
              {CAT_LABEL[c]}
            </span>
          ))
        )}
      </p>
    </div>
  );
}

function rank(n: GNode, active: string | null) {
  return n.id === active ? 0 : n.kind === 'project' ? 1 : 2;
}

// Tokens are hex. Anything else is passed through without the alpha.
function rgba(color: string, a: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
