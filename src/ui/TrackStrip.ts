
const W = 640;
const H = 170;
const X0 = 22;
const X1 = 618;
const Y_TOP = 34;
const Y_BOT = 138;

const CRUISE = 100;
const V_MIN = 48;
const V_MAX = 190;
const GRAVITY = 480;
const SLOPE_ACC = 330;
const LAUNCH_EPS = 55;

interface Pt { x: number; y: number; }

function densify(ctrl: Pt[], subdiv = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < subdiv; s++) {
      const t = s / subdiv, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function pathFrom(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function terrainAt(pts: Pt[], x: number): { y: number; slope: number } {
  if (x <= pts[0].x) return { y: pts[0].y, slope: 0 };
  if (x >= pts[pts.length - 1].x) return { y: pts[pts.length - 1].y, slope: 0 };
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].x <= x) lo = mid; else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const f = (x - a.x) / (b.x - a.x || 1);
  return { y: a.y + (b.y - a.y) * f, slope: (b.y - a.y) / (b.x - a.x || 1) };
}

function bikeSVG(): string {
  const wheel = `<circle r="14" fill="#1a1a1a" stroke="#444" stroke-width="3"/><circle r="10" fill="none" stroke="#666" stroke-width="1"/><path class="tsb-spokes" d="M0 -10 V10 M-10 0 H10 M-7 -7 L7 7 M-7 7 L7 -7" stroke="#555" stroke-width="1.5"/><circle r="2.5" fill="#777"/>`;
  return `
    <g class="tsb" opacity="0">
      <g transform="scale(0.4) translate(0,-28)">
        <g transform="translate(-35,14)"><g class="tsb-w">${wheel}</g></g>
        <g transform="translate(35,14)"><g class="tsb-w">${wheel}</g></g>
        <path d="M-19 2 L-35 14" stroke="#666" stroke-width="3"/>
        <path d="M19 -6 L23 -2 L35 14" fill="none" stroke="#888" stroke-width="3"/>
        <path d="M-8 0 L6 0 L8 8 L-10 8 Z" fill="#333" stroke="#555" stroke-width="0.8"/>
        <path d="M-17 -2 L0 -8 L17 -6 M0 -8 L-2 6" fill="none" stroke="#E24B4A" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M-2 -6 L-19 0" stroke="#C43" stroke-width="1.5"/>
        <path d="M-15 -4 Q-9 -10 -2 -9 L4 -10 Q2 -6 -2 -9 Z" fill="#222"/>
        <path d="M2 -10 Q8 -14 13 -8 L15 -4 Q6 -4 2 -10 Z" fill="#E24B4A"/>
        <circle cx="19" cy="-10" r="5" fill="#ddd"/>
        <path d="M15 -14 L23 -16" stroke="#888" stroke-width="2"/>
        <path d="M-4 8 Q-12 12 -17 6" fill="none" stroke="#777" stroke-width="2.5"/>
        <path d="M-17 6 L-21 5" stroke="#999" stroke-width="3"/>
        <rect x="-2" y="4" width="8" height="4" fill="#333"/>
        <path d="M2 4 L-2 -4 M2 4 L4 -6" fill="none" stroke="#bbb" stroke-width="3" stroke-linecap="round"/>
        <path d="M0 -8 L4 -22" stroke="#bbb" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="4" cy="-32" r="5" fill="#E24B4A"/>
        <path d="M8.2 -32.2 A2.5 2.5 0 0 1 7.7 -29.2 L6 -31 Z" fill="#222"/>
        <path d="M4 -18 Q11 -20 17 -14" fill="none" stroke="#bbb" stroke-width="2.5" stroke-linecap="round"/>
      </g>
    </g>`;
}

export function checkerFlagSVG(x: number, yGround: number, poleH: number, sq: number): string {
  const top = yGround - poleH;
  const squares: string[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++)
      squares.push(`<rect x="${(x - (4 - c) * sq).toFixed(1)}" y="${(top + r * sq).toFixed(1)}" width="${sq}" height="${sq}" fill="${(r + c) % 2 === 0 ? '#fff' : '#111'}"/>`);
  return `<line x1="${x}" y1="${yGround.toFixed(1)}" x2="${x}" y2="${top.toFixed(1)}" stroke="#888" stroke-width="2"/>${squares.join('')}<rect x="${(x - 4 * sq).toFixed(1)}" y="${top.toFixed(1)}" width="${sq * 4}" height="${sq * 2}" fill="none" stroke="#555" stroke-width="1"/>`;
}

export function mountTrackStrip(host: HTMLElement, closes: number[], color: string): () => void {
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const ctrl: Pt[] = closes.map((c, i) => ({
    x: X0 + (i / (closes.length - 1)) * (X1 - X0),
    y: Y_BOT - ((c - min) / range) * (Y_BOT - Y_TOP),
  }));
  const terrain = densify(ctrl);
  const d = pathFrom(terrain);
  const first = terrain[0], last = terrain[terrain.length - 1];
  const uid = `ts${Math.random().toString(36).slice(2, 8)}`;

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="A motocross bike riding a stock chart as terrain">
    <defs>
      <linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.13"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${d} L ${X1} ${H - 2} L ${X0} ${H - 2} Z" fill="url(#${uid})" stroke="none"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    <text x="${first.x + 7}" y="${(first.y - 24).toFixed(1)}" font-family="JetBrains Mono, monospace" font-size="9" fill="${color}" letter-spacing="1.5">START</text>
    ${checkerFlagSVG(last.x, last.y, 32, 4)}
    <g class="ts-fx"></g>
    ${bikeSVG()}
  </svg>`;

  const svg = host.querySelector('svg')!;
  const bike = svg.querySelector('.tsb') as SVGGElement;
  const wheels = svg.querySelectorAll('.tsb-w') as NodeListOf<SVGGElement>;
  const fx = svg.querySelector('.ts-fx') as SVGGElement;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    const px = X0 + (X1 - X0) * 0.3;
    const t = terrainAt(terrain, px);
    bike.setAttribute('transform', `translate(${px.toFixed(1)} ${t.y.toFixed(1)}) rotate(${(Math.atan(t.slope) * 180 / Math.PI).toFixed(1)})`);
    bike.setAttribute('opacity', '1');
    return () => {};
  }

  let x = first.x + 4;
  let y = terrainAt(terrain, x).y;
  let vx = CRUISE * 0.7;
  let vy = 0;
  let airborne = false;
  let airTime = 0;
  let angle = 0;
  let wheelRot = 0;
  let opacity = 0;
  let raf = 0;
  let lastT = 0;
  let stopped = false;

  function puff(px: number, py: number, strength: number) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'ts-puff');
    g.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
    const n = strength > 0.6 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', String(2 + Math.random() * 1.5));
      c.setAttribute('cx', String((i - n / 2) * 5));
      c.setAttribute('cy', '-1');
      c.style.animationDelay = `${i * 45}ms`;
      g.appendChild(c);
    }
    fx.appendChild(g);
    setTimeout(() => g.remove(), 700);
  }

  function step(now: number) {
    if (stopped) return;
    if (!host.isConnected) { stopped = true; return; }
    const dt = Math.min(0.032, lastT ? (now - lastT) / 1000 : 0.016);
    lastT = now;

    if (!airborne) {
      const t = terrainAt(terrain, x);
      vx += ((CRUISE - vx) * 0.9 + t.slope * SLOPE_ACC) * dt;
      vx = Math.max(V_MIN, Math.min(V_MAX, vx));
      const groundVy = t.slope * vx;
      const nx = x + vx * dt;
      const tn = terrainAt(terrain, nx);
      const requiredVy = (tn.y - y) / dt;
      const ballisticVy = groundVy + GRAVITY * dt;
      if (requiredVy > ballisticVy + LAUNCH_EPS && vx > CRUISE * 0.75) {
        airborne = true;
        airTime = 0;
        vy = groundVy;
        x = nx;
        y += vy * dt;
      } else {
        x = nx;
        y = tn.y;
        const target = Math.atan(tn.slope) * 180 / Math.PI;
        angle += (target - angle) * Math.min(1, 14 * dt);
      }
    } else {
      airTime += dt;
      vy += GRAVITY * dt;
      x += vx * dt;
      y += vy * dt;
      const t = terrainAt(terrain, x);
      const target = Math.max(-26, Math.min(38, Math.atan2(vy, vx) * 180 / Math.PI * 0.7));
      angle += (target - angle) * Math.min(1, 5 * dt);
      if (y >= t.y) {
        y = t.y;
        airborne = false;
        if (airTime > 0.28) puff(x - 8, y, Math.min(1, airTime));
        vx = Math.max(V_MIN, vx * 0.94);
        vy = 0;
      }
    }

    if (x > X1 - 26) opacity = Math.max(0, (X1 - 6 - x) / 20);
    else opacity = Math.min(1, opacity + 2.5 * dt);
    if (x >= X1 - 6) {
      x = first.x + 4;
      y = terrainAt(terrain, x).y;
      vx = CRUISE * 0.7;
      vy = 0;
      airborne = false;
      angle = 0;
      opacity = 0;
    }

    wheelRot += (vx * dt) / 5.6 * (180 / Math.PI);
    bike.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
    bike.setAttribute('opacity', opacity.toFixed(2));
    wheels.forEach(w => w.setAttribute('transform', `rotate(${(wheelRot % 360).toFixed(0)})`));

    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
