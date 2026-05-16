// Force-directed evidence graph: skills clustered by category, linked to the
// projects that prove them, drawn to canvas and settled with d3-force.
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
import type { Skill, Project, Edge, Category } from '../lib/facts';
import { withBase } from '../lib/paths';

// Palette mirrors tokens.css. Hard-coded so the canvas never depends on
// getComputedStyle timing.
const INK = '#0a0e13';
const GRID = '#141a22';
const LINE = '#2a323d';
const LINE_HI = '#3a4553';
const TEXT = '#e6eaf0';
const DIM = '#9ba6b4';
const SIGNAL = '#f2c14e';
const CAT: Record<Category, string> = {
  ml: '#5ac8d8',
  systems: '#7fc96f',
  web: '#ae9deb',
  infra: '#e88ab0',
};
const CAT_LABEL: Record<Category, string> = {
  ml: 'AI / ML',
  systems: 'Systems',
  web: 'Web / backend',
  infra: 'Infrastructure',
};
// Category cluster anchors (sim-space). Skills gravitate toward their category's
// corner, so the graph reads as four labelled regions instead of a hairball.
// Projects float in the middle, pulled by their edges toward the skills they use.
const CATS: Category[] = ['ml', 'systems', 'web', 'infra'];
// The four canvas corners in clockwise order: top-left, top-right, bottom-right,
// bottom-left. At rotation 0, CATS[i] anchors to CORNERS[i]. Each rotation step
// shifts every category one corner along, which spins the whole layout.
const CORNERS: Array<[number, number]> = [
  [-155, -120],
  [155, -120],
  [155, 120],
  [-155, 120],
];
function anchorFor(cat: Category, rot: number): [number, number] {
  return CORNERS[(CATS.indexOf(cat) + rot) % 4];
}
// Which category sits at canvas corner j for a given rotation.
function catAtCorner(j: number, rot: number): Category {
  return CATS[(j - rot + 4) % 4];
}

interface Props {
  skills: Skill[];
  projects: Project[];
  edges: Edge[];
}

interface GNode {
  id: string;
  kind: 'skill' | 'project';
  label: string;
  category?: Category;
  r: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}
interface GLink {
  source: GNode | string;
  target: GNode | string;
  evidence: string;
}

export default function EvidenceGraph({ skills, projects, edges }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Refs, not state: the tick loop mutates these every frame and must never
  // trigger a React re-render.
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);
  const rafRef = useRef<number>(0);
  const transformRef = useRef({ s: 1, ox: 0, oy: 0 });
  const rotationRef = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // ---- lookups -----------------------------------------------------------
  const { nodes, links, adjacency, byId, projectsForSkill, skillsForProject } = useMemo(() => {
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.project, (degree.get(e.project) ?? 0) + 1);
      degree.set(e.skill, (degree.get(e.skill) ?? 0) + 1);
    }
    const nodes: GNode[] = [
      ...projects.map((p) => ({
        id: p.id,
        kind: 'project' as const,
        label: p.label,
        r: 8 + Math.sqrt(degree.get(p.id) ?? 1) * 1.3,
        x: 0,
        y: 0,
      })),
      ...skills.map((s) => ({
        id: s.id,
        kind: 'skill' as const,
        label: s.label,
        category: s.category,
        r: 5,
        x: 0,
        y: 0,
      })),
    ];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: GLink[] = edges.map((e) => ({ source: e.skill, target: e.project, evidence: e.evidence }));
    const adjacency = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adjacency.has(e.skill)) adjacency.set(e.skill, new Set());
      if (!adjacency.has(e.project)) adjacency.set(e.project, new Set());
      adjacency.get(e.skill)!.add(e.project);
      adjacency.get(e.project)!.add(e.skill);
    }
    const projectsForSkill = (id: string) =>
      edges
        .filter((e) => e.skill === id)
        .map((e) => ({ project: projects.find((p) => p.id === e.project)!, evidence: e.evidence }))
        .filter((x) => x.project);
    const skillsForProject = (id: string) =>
      edges
        .filter((e) => e.project === id)
        .map((e) => ({ skill: skills.find((s) => s.id === e.skill)!, evidence: e.evidence }))
        .filter((x) => x.skill);
    return { nodes, links, adjacency, byId, projectsForSkill, skillsForProject };
  }, [skills, projects, edges]);

  // Deterministic tab order: projects first, then skills, both in facts order.
  const orderedNodes = nodes;

  // The node whose highlight is active (selection wins, then focus, then hover).
  const activeId = selectedId ?? focusId ?? hoverId;

  // ---- draw --------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Render at >= 2x so canvas text and nodes stay crisp even on a 1x display
    // (supersampling), capped at 3x to keep high-DPI screens performant.
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const storeW = Math.round(cw * dpr);
    const storeH = Math.round(ch * dpr);
    if (canvas.width !== storeW || canvas.height !== storeH) {
      canvas.width = storeW;
      canvas.height = storeH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // background + faint grid (the scope screen)
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    const grid = 32;
    ctx.beginPath();
    for (let x = grid; x < cw; x += grid) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, ch);
    }
    for (let y = grid; y < ch; y += grid) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(cw, y + 0.5);
    }
    ctx.stroke();

    const PAD = 46;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const s = Math.min((cw - 2 * PAD) / bw, (ch - 2 * PAD) / bh, 2.4);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const ox = cw / 2 - cx * s;
    const oy = ch / 2 - cy * s;
    transformRef.current = { s, ox, oy };
    const sx = (n: GNode) => n.x * s + ox;
    const sy = (n: GNode) => n.y * s + oy;

    const active = activeId;
    const neighbors = active ? adjacency.get(active) : undefined;
    const isLit = (id: string) => !active || id === active || (neighbors?.has(id) ?? false);

    // category labels pinned to the four canvas corners, so it is obvious which
    // cluster is which. Each label sits in the corner its category clusters toward.
    const CLPAD = 12;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '500 12px "IBM Plex Mono", ui-monospace, monospace';
    for (let j = 0; j < 4; j++) {
      const cat = catAtCorner(j, rotationRef.current);
      const [ax, ay] = CORNERS[j];
      const label = CAT_LABEL[cat].toUpperCase();
      const tw = ctx.measureText(label).width;
      const dotR = 3.5;
      const gap = 7;
      const blockW = dotR * 2 + gap + tw;
      const lx = ax > 0 ? cw - CLPAD - blockW : CLPAD;
      const ly = ay > 0 ? ch - CLPAD - 8 : CLPAD + 8;
      // dark plate for legibility over the graph
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = INK;
      roundRect(ctx, lx - 6, ly - 10, blockW + 12, 20, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(lx + dotR, ly, dotR, 0, Math.PI * 2);
      ctx.fillStyle = CAT[cat];
      ctx.fill();
      ctx.fillText(label, lx + dotR * 2 + gap, ly + 0.5);
    }
    ctx.globalAlpha = 1;

    // links (active edges get a category -> node gradient stroke)
    for (const l of links) {
      const src = l.source as GNode;
      const tgt = l.target as GNode;
      const x1 = sx(src), y1 = sy(src), x2 = sx(tgt), y2 = sy(tgt);
      const lit = !active || active === src.id || active === tgt.id;
      if (lit && active) {
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        const catColor = byId.get(src.id)?.category ? CAT[byId.get(src.id)!.category!] : LINE_HI;
        g.addColorStop(0, catColor);
        g.addColorStop(1, '#cfd6e0');
        ctx.strokeStyle = g;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = lit ? LINE : GRID;
        ctx.globalAlpha = active ? 0.1 : 0.42;
        ctx.lineWidth = 1;
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // active-node halo: a soft category (or amber) radial bloom under the node
    if (active) {
      const an = byId.get(active);
      if (an) {
        const hx = sx(an), hy = sy(an);
        const color = an.kind === 'project' ? SIGNAL : an.category ? CAT[an.category] : DIM;
        const hr = an.r * 4.4;
        const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        halo.addColorStop(0, hexA(color, 0.32));
        halo.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(hx, hy, hr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const n of nodes) {
      const x = sx(n);
      const y = sy(n);
      const lit = isLit(n.id);
      const isActive = active === n.id;
      const r = isActive ? n.r * 1.16 : n.r;
      ctx.globalAlpha = lit ? 1 : 0.2;
      if (n.kind === 'project') {
        // rounded square with a subtle top-lit gradient for depth
        const grad = ctx.createLinearGradient(x, y - r, x, y + r);
        if (isActive) {
          grad.addColorStop(0, '#ffe08a');
          grad.addColorStop(1, SIGNAL);
        } else {
          grad.addColorStop(0, '#f6f8fb');
          grad.addColorStop(1, '#d7dde7');
        }
        ctx.fillStyle = grad;
        roundRect(ctx, x - r, y - r, r * 2, r * 2, 3);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        const color = n.category ? CAT[n.category] : DIM;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (isActive) {
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // labels. Idle shows project labels. When a node is active, show only it and
    // its lit neighbors, and skip any label that would overlap one already drawn,
    // so hovering a hub project no longer piles text on top of itself.
    ctx.textBaseline = 'middle';
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const overlap = (
      a: { x: number; y: number; w: number; h: number },
      b: { x: number; y: number; w: number; h: number },
    ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const labelNodes = nodes
      .filter((n) => (active ? isLit(n.id) : n.kind === 'project'))
      .sort((a, b) => {
        const pa = a.id === active ? 0 : a.kind === 'project' ? 1 : 2;
        const pb = b.id === active ? 0 : b.kind === 'project' ? 1 : 2;
        return pa - pb;
      });
    for (const n of labelNodes) {
      const lit = isLit(n.id);
      const x = sx(n);
      const y = sy(n);
      ctx.font =
        n.kind === 'project'
          ? '600 12px "IBM Plex Mono", ui-monospace, monospace'
          : '400 11px "IBM Plex Mono", ui-monospace, monospace';
      const label = n.label;
      const w = ctx.measureText(label).width;
      // try right, left, then the same on a slight up/down nudge, so stacked
      // labels find a free slot instead of overlapping. Skip only if all collide.
      const rx = x + n.r + 5;
      const lx = x - n.r - 5 - w;
      const candidates: Array<[number, number]> = [
        [rx, y],
        [lx, y],
        [rx, y - 13],
        [rx, y + 13],
        [lx, y - 13],
        [lx, y + 13],
      ];
      let chosen: [number, number] | null = null;
      for (const [cx, cy] of candidates) {
        const rect = { x: cx - 2, y: cy - 9, w: w + 4, h: 18 };
        if (n.id === active || !placed.some((r) => overlap(rect, r))) {
          chosen = [cx, cy];
          placed.push(rect);
          break;
        }
      }
      if (!chosen) continue;
      const [tx, ty] = chosen;
      ctx.globalAlpha = lit ? 0.8 : 0.25;
      ctx.fillStyle = INK;
      ctx.fillRect(tx - 2, ty - 9, w + 4, 18);
      ctx.globalAlpha = lit ? 1 : 0.28;
      ctx.fillStyle = n.kind === 'project' ? TEXT : n.category ? CAT[n.category] : DIM;
      ctx.fillText(label, tx, ty + 0.5);
    }
    ctx.globalAlpha = 1;

    // focus ring (keyboard) and selection ring
    const ringFor = (id: string | null, color: string, dashed: boolean) => {
      if (!id) return;
      const n = byId.get(id);
      if (!n) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [3, 3] : []);
      ctx.beginPath();
      ctx.arc(sx(n), sy(n), n.r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    ringFor(selectedId, SIGNAL, false);
    if (focusId && focusId !== selectedId) ringFor(focusId, SIGNAL, true);
  }, [nodes, links, adjacency, byId, activeId, selectedId, focusId]);

  // ---- simulation + lifecycle -------------------------------------------
  // Runs (or re-runs) the settle animation from the current alpha. A low
  // alphaDecay makes it drift into place slowly and smoothly.
  const runSettle = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    cancelAnimationFrame(rafRef.current);
    // Reduced motion: tick straight to a settled layout and draw once, no
    // animation frames.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 800 && sim.alpha() > sim.alphaMin(); i++) sim.tick();
      draw();
      return;
    }
    const loop = () => {
      sim.tick();
      draw();
      if (sim.alpha() > sim.alphaMin()) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  // Replay the intro: send every node back to the centre and settle again.
  const replay = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setSelectedId(null);
    setHoverId(null);
    setFocusId(null);
    for (const n of nodes) {
      n.x = 0;
      n.y = 0;
      n.vx = 0;
      n.vy = 0;
    }
    sim.alpha(1);
    runSettle();
  }, [nodes, runSettle]);

  // Rotate the category corners one step, then replay so the layout spins into
  // its new arrangement.
  const rotate = useCallback(() => {
    rotationRef.current = (rotationRef.current + 1) % 4;
    replay();
  }, [replay]);

  useEffect(() => {
    const sim = forceSimulation<GNode>(nodes)
      .force('charge', forceManyBody<GNode>().strength(-135).distanceMax(340))
      .force(
        'link',
        forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance(46)
          .strength(0.22),
      )
      .force(
        'collide',
        forceCollide<GNode>()
          .radius((d) => d.r + (d.kind === 'project' ? 13 : 7))
          .strength(0.92),
      )
      .force(
        'x',
        forceX<GNode>((d) =>
          d.kind === 'skill' && d.category ? anchorFor(d.category, rotationRef.current)[0] : 0,
        ).strength((d) => (d.kind === 'skill' ? 0.17 : 0.02)),
      )
      .force(
        'y',
        forceY<GNode>((d) =>
          d.kind === 'skill' && d.category ? anchorFor(d.category, rotationRef.current)[1] : 0,
        ).strength((d) => (d.kind === 'skill' ? 0.17 : 0.02)),
      )
      .alpha(1)
      .alphaMin(0.0035)
      .alphaDecay(0.021)
      .velocityDecay(0.45)
      .stop();
    simRef.current = sim;
    runSettle();

    return () => {
      cancelAnimationFrame(rafRef.current);
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links]);

  // redraw when interaction state changes (positions already settled)
  useEffect(() => {
    if (!simRef.current) return;
    if (simRef.current.alpha() <= simRef.current.alphaMin()) draw();
  }, [activeId, selectedId, focusId, draw]);

  // responsive: redraw on container resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // ---- pointer -----------------------------------------------------------
  const nodeAtPoint = useCallback(
    (clientX: number, clientY: number): GNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const { s, ox, oy } = transformRef.current;
      let best: GNode | null = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const dx = n.x * s + ox - px;
        const dy = n.y * s + oy - py;
        const d = dx * dx + dy * dy;
        const hit = n.r + 5;
        if (d < hit * hit && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    },
    [nodes],
  );

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return; // touch uses tap-to-select
    const n = nodeAtPoint(e.clientX, e.clientY);
    setHoverId(n ? n.id : null);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = n ? 'pointer' : 'default';
  };
  const onCanvasClick = (e: React.PointerEvent) => {
    const n = nodeAtPoint(e.clientX, e.clientY);
    if (n) {
      setSelectedId(n.id);
      setFocusId(n.id);
      // move DOM focus to the matching offscreen button for a11y sync
      document.getElementById(`gnode-${n.id}`)?.focus({ preventScroll: true });
    } else {
      setSelectedId(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelectedId(null);
      setHoverId(null);
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  };

  const selected = selectedId ? byId.get(selectedId) : null;
  const selProject = selected?.kind === 'project' ? projects.find((p) => p.id === selected.id) : null;
  const selSkill = selected?.kind === 'skill' ? skills.find((s) => s.id === selected.id) : null;

  return (
    <div className="eg" onKeyDown={onKeyDown}>
      <div className="eg__canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="eg__canvas"
          aria-hidden="true"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverId(null)}
          onClick={onCanvasClick as unknown as (e: React.MouseEvent) => void}
        ></canvas>

        {/* Accessible, keyboard-navigable node list. Visually hidden, the canvas
            draws the focus ring. Tabbing cycles nodes, Enter/Space selects. */}
        <ul className="eg__nodes" aria-label="Evidence graph: skills and projects">
          {orderedNodes.map((n) => (
            <li key={n.id}>
              <button
                id={`gnode-${n.id}`}
                type="button"
                className="eg__node-btn"
                onFocus={() => setFocusId(n.id)}
                onBlur={() => setFocusId((f) => (f === n.id ? null : f))}
                onClick={() => setSelectedId(n.id)}
              >
                {n.kind === 'project'
                  ? `Project: ${n.label}. ${adjacency.get(n.id)?.size ?? 0} skills.`
                  : `Skill: ${n.label}, ${n.category ? CAT_LABEL[n.category] : ''}. ${adjacency.get(n.id)?.size ?? 0} projects.`}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Detail panel. A replay control sits above a live region that holds the
          hint or the selected-node detail. */}
      <div className="eg__panel">
        <div className="eg__controls">
          <button
            type="button"
            className="eg__replay"
            onClick={rotate}
            aria-label="Rotate the graph and replay the animation"
          >
            <span className="eg__replay-icon" aria-hidden="true">&#8635;</span> Rotate
          </button>
        </div>
        <div className="eg__panel-body" aria-live="polite">
        {!selected && (
          <div className="eg__hint">
            <p className="eg__hint-lede">
              Hover or tap any node. The small colored dots are skills, grouped by
              category. The bigger squares are projects. Pick one to see the results
              that tie them together.
            </p>
            <ul className="eg__legend">
              {(['ml', 'systems', 'web', 'infra'] as Category[]).map((c) => (
                <li key={c}>
                  <span className="eg__swatch" style={{ background: CAT[c] }} aria-hidden="true"></span>
                  {CAT_LABEL[c]}
                </li>
              ))}
              <li>
                <span className="eg__swatch eg__swatch--proj" aria-hidden="true"></span>
                Project
              </li>
            </ul>
          </div>
        )}

        {selSkill && (
          <div className="eg__detail">
            <p className="eg__detail-kind mono" data-cat={selSkill.category}>
              <span className="dot" aria-hidden="true"></span>
              {CAT_LABEL[selSkill.category]}
            </p>
            <h3 className="eg__detail-title">{selSkill.label}</h3>
            <p className="eg__detail-sub mono">{projectsForSkill(selSkill.id).length} projects with evidence</p>
            <ul className="eg__evidence">
              {projectsForSkill(selSkill.id).map(({ project, evidence }) => (
                <li key={project.id}>
                  <a className="eg__ev-proj mono" href={withBase(project.caseStudy)}>
                    {project.label}
                  </a>
                  <span className="eg__ev-text">{evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selProject && (
          <div className="eg__detail">
            <p className="eg__detail-kind mono">Project</p>
            <h3 className="eg__detail-title">{selProject.label}</h3>
            <p className="eg__detail-one">{selProject.oneLiner}</p>
            <ul className="eg__chips">
              {skillsForProject(selProject.id).map(({ skill }) => (
                <li key={skill.id} className="eg__chip mono" data-cat={skill.category}>
                  <span className="dot" aria-hidden="true"></span>
                  {skill.label}
                </li>
              ))}
            </ul>
            <div className="eg__detail-links mono">
              <a className="btn" href={withBase(selProject.caseStudy)}>Read case study</a>
              <a className="btn btn--ghost" href={selProject.repo} target="_blank" rel="noopener">
                Repository
              </a>
              {selProject.demo && (
                <a className="btn btn--ghost" href={selProject.demo.url} target="_blank" rel="noopener">
                  {selProject.demo.label}
                </a>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
