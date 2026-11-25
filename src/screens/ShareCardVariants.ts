
export interface CardGameEvent {
  type: 'crash' | 'moon';
  progress: number;
}

export interface CardInput {
  score: number;
  ticker: string;
  name: string;
  period: string;
  difficulty: string;
  time: number;
  crashes: number;
  maxStreak: number;
  flips: number;
  finished: boolean;
  disaster: boolean;
  worldRecord?: boolean;
  nickname: string;
  dataPoints: { date: string; close: number }[];
  tricks: Record<string, number>;
  events: CardGameEvent[];
  isStartup?: boolean;
  slug?: string;
  founderHandle?: string;
  granularity?: string;
  challengeScore?: number;
}

export interface CardVariant {
  id: string;
  title: string;
  tagline: string;
  width: number;
  height: number;
  render: (input: CardInput) => Promise<HTMLCanvasElement>;
  requiresChallenge?: boolean;
}

const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const EMOJI_FALLBACK = ', "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

function mono(weight: number, size: number): string {
  return `${weight} ${size}px ${MONO}`;
}
function impact(size: number): string {
  return `900 ${size}px Impact, "Arial Black", sans-serif`;
}
function setLS(ctx: CanvasRenderingContext2D, px: number) {
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all(
      ['400', '500', '700', '800'].map(w => document.fonts.load(`${w} 32px "JetBrains Mono"`)),
    ).then(() => undefined).catch(() => undefined);
  }
  return fontsReady;
}

function mkCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(input: CardInput): number {
  let h = input.score;
  for (const c of input.ticker) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) + 7;
}

function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export function topPercent(score: number): number {
  const mu = Math.log(4300);
  const sigma = (Math.log(33000) - mu) / 1.6449;
  const z = (Math.log(Math.max(1, score)) - mu) / sigma;
  const pct = 0.5 * (1 + erf(z / Math.SQRT2));
  return Math.max(1, Math.min(99, Math.round((1 - pct) * 100)));
}

export function medalFor(score: number): { emoji: string; label: string } | null {
  const tp = topPercent(score);
  if (tp <= 5) return { emoji: '🥇', label: 'Gold' };
  if (tp <= 15) return { emoji: '🥈', label: 'Silver' };
  if (tp <= 40) return { emoji: '🥉', label: 'Bronze' };
  return null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

function fmtScore(score: number): string {
  return score.toLocaleString('en-US');
}

function rankLine(score: number): string {
  const tp = topPercent(score);
  return tp <= 50 ? `TOP ${tp}%` : `BOTTOM ${100 - tp}%`;
}

function tricksLine(input: CardInput, max = 3): string | null {
  const entries = Object.entries(input.tricks).filter(([, c]) => c > 0);
  if (!entries.length) return null;
  const shown = entries.slice(0, max).map(([n, c]) => `${n.toUpperCase()} ×${c}`);
  const extra = entries.length - max;
  return shown.join(' · ') + (extra > 0 ? ` +${extra}` : '');
}

function trackUrl(input: CardInput): string {
  return input.isStartup ? `sisonpiy-droid.github.io/dalalrider/#/trustmrr:${input.slug || input.ticker.toLowerCase()}` : `sisonpiy-droid.github.io/dalalrider/#/${input.ticker}`;
}
function trackLabel(input: CardInput): string {
  return input.isStartup
    ? `${input.name} · REVENUE · ${(input.granularity || 'weekly').toUpperCase()} · ${input.period.toUpperCase()}`
    : `${input.ticker} · ${input.period.toUpperCase()} · ${input.difficulty.toUpperCase()}`;
}

function verdict(input: CardInput): string {
  if (input.worldRecord) return 'WORLD RECORD';
  if (input.disaster) return 'TOTAL WIPEOUT';
  if (input.crashes === 0 && input.finished) return 'DIAMOND HANDS';
  if (topPercent(input.score) <= 10) return 'MOON CANDIDATE';
  return 'SURVIVED THE MARKET';
}

interface ChartGeo { toX: (i: number) => number; toY: (p: number) => number }
function chartGeo(prices: number[], x: number, y: number, w: number, h: number): ChartGeo {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return {
    toX: (i: number) => x + (i / (prices.length - 1)) * w,
    toY: (p: number) => y + h - ((p - min) / range) * h,
  };
}

function tracePath(ctx: CanvasRenderingContext2D, prices: number[], geo: ChartGeo) {
  ctx.beginPath();
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) ctx.moveTo(geo.toX(i), geo.toY(prices[i]));
    else ctx.lineTo(geo.toX(i), geo.toY(prices[i]));
  }
}

function strokeSeries(ctx: CanvasRenderingContext2D, prices: number[], geo: ChartGeo, color: string, width: number, glow = 0) {
  ctx.save();
  if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  tracePath(ctx, prices, geo);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function fillSeries(ctx: CanvasRenderingContext2D, prices: number[], geo: ChartGeo, colorTop: string, baseY: number) {
  const first = geo.toY(prices[0]);
  const grad = ctx.createLinearGradient(0, Math.min(first, baseY - 200), 0, baseY);
  grad.addColorStop(0, colorTop);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  tracePath(ctx, prices, geo);
  ctx.lineTo(geo.toX(prices.length - 1), baseY);
  ctx.lineTo(geo.toX(0), baseY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawEvents(ctx: CanvasRenderingContext2D, input: CardInput, prices: number[], geo: ChartGeo, topY: number, size = 22) {
  ctx.save();
  ctx.font = `${size}px ${MONO}${EMOJI_FALLBACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const ev of input.events) {
    const idx = Math.min(prices.length - 1, Math.max(0, Math.round(ev.progress * (prices.length - 1))));
    const ex = geo.toX(idx);
    const ey = ev.type === 'moon' ? topY + size + 4 : geo.toY(prices[idx]);
    ctx.fillText(ev.type === 'moon' ? '\u{1F319}' : '\u{1F480}', ex, ey - 4);
  }
  ctx.restore();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, font: string, fg: string, bg: string, padX = 14, padY = 8, border?: string): number {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  const m = ctx.measureText('M');
  const h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + padY * 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  return w;
}

function drawStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, color: string, angle = -0.2, sub?: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = 0.85;
  let subW = 0;
  if (sub) {
    ctx.font = mono(700, 17);
    setLS(ctx, 3);
    subW = ctx.measureText(sub).width;
  }
  ctx.font = mono(800, 54);
  setLS(ctx, 6);
  const tw = ctx.measureText(text).width;
  const w = Math.max(tw, subW) + 72;
  const h = sub ? 128 : 96;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 10); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 6); ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, sub ? -14 : 2);
  if (sub) {
    ctx.font = mono(700, 17);
    setLS(ctx, 3);
    ctx.fillText(sub, 0, 34);
  }
  setLS(ctx, 0);
  ctx.restore();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

function dashedLine(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number, color: string, width = 2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

async function renderPnl(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 1200, H = 675;
  const { canvas, ctx } = mkCanvas(W, H);
  const green = '#2EBD85', red = '#F6465D';
  const accent = input.isStartup ? '#5066FB' : (input.disaster ? red : green);

  ctx.fillStyle = '#0B0E11';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(220, 120, 0, 220, 120, 700);
  glow.addColorStop(0, input.disaster ? 'rgba(246,70,93,0.10)' : (input.isStartup ? 'rgba(80,102,251,0.10)' : 'rgba(46,189,133,0.10)'));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = mono(800, 26);
  setLS(ctx, 2);
  ctx.fillStyle = '#F4F4F6';
  ctx.fillText('DALALRIDER', 64, 78);
  const brandW = ctx.measureText('DALALRIDER').width;
  setLS(ctx, 0);
  ctx.fillStyle = '#3A4048';
  ctx.fillRect(64 + brandW + 20, 54, 2, 28);
  ctx.font = mono(500, 22);
  ctx.fillStyle = '#8A939E';
  ctx.fillText('RIDE P&L', 64 + brandW + 40, 76);

  ctx.textAlign = 'right';
  ctx.font = mono(500, 20);
  ctx.fillStyle = '#5C6570';
  ctx.fillText(`@${input.nickname}`, W - 64, 76);

  ctx.textAlign = 'left';
  ctx.font = mono(700, 30);
  ctx.fillStyle = '#C8CFD8';
  ctx.fillText(input.isStartup ? input.name : `${input.ticker} · ${input.name}`, 64, 148);
  ctx.font = mono(400, 19);
  ctx.fillStyle = '#5C6570';
  ctx.fillText(input.isStartup
    ? `Revenue ride · ${(input.granularity || 'weekly').toUpperCase()} · ${input.period.toUpperCase()}`
    : `Chart ride · ${input.period.toUpperCase()} · ${input.difficulty.toUpperCase()} track`, 64, 180);

  ctx.font = mono(500, 20);
  ctx.fillStyle = '#5C6570';
  setLS(ctx, 3);
  ctx.fillText('SESSION PNL (PTS)', 64, 262);
  setLS(ctx, 0);
  ctx.font = mono(800, 118);
  ctx.fillStyle = input.disaster ? red : (input.isStartup ? '#7A8BFF' : green);
  ctx.fillText(`${input.disaster ? '' : '+'}${fmtScore(input.score)}`, 58, 378);

  let px = 64;
  const pillFont = mono(700, 19);
  if (input.worldRecord) {
    px += pill(ctx, px, 412, '\u{1F451} WORLD RECORD', pillFont, '#FFD75E', 'rgba(255,215,94,0.12)', 16, 10, 'rgba(255,215,94,0.4)') + 12;
  } else if (input.disaster) {
    px += pill(ctx, px, 412, '\u{1F480} TOTAL WIPEOUT', pillFont, red, 'rgba(246,70,93,0.12)', 16, 10, 'rgba(246,70,93,0.4)') + 12;
  } else {
    px += pill(ctx, px, 412, `${rankLine(input.score)} OF ALL RIDERS`, pillFont, accent, input.isStartup ? 'rgba(80,102,251,0.14)' : 'rgba(46,189,133,0.12)', 16, 10, input.isStartup ? 'rgba(80,102,251,0.45)' : 'rgba(46,189,133,0.4)') + 12;
  }
  if (input.maxStreak > 1) px += pill(ctx, px, 412, `\u{1F525} x${input.maxStreak} STREAK`, pillFont, '#EF9F27', 'rgba(239,159,39,0.10)', 16, 10, 'rgba(239,159,39,0.35)') + 12;
  px += pill(ctx, px, 412, `⏱ ${formatTime(input.time)}`, pillFont, '#8A939E', 'rgba(138,147,158,0.08)', 16, 10, 'rgba(138,147,158,0.25)') + 12;

  const pnlTricks = tricksLine(input);
  if (pnlTricks) {
    ctx.font = mono(500, 18);
    ctx.fillStyle = '#5C6570';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`TRICKS: ${pnlTricks}`, 64, 500);
  }

  const cta = `BEAT MY RUN → ${trackUrl(input)}`;
  let ctaFont = 24;
  ctx.font = mono(800, ctaFont);
  while (ctx.measureText(cta).width + 56 > 630 && ctaFont > 15) {
    ctaFont--;
    ctx.font = mono(800, ctaFont);
  }
  const ctaW = ctx.measureText(cta).width + 56;
  ctx.beginPath();
  ctx.roundRect(64, 548, ctaW, 62, 12);
  ctx.fillStyle = input.disaster ? red : accent;
  ctx.fill();
  ctx.fillStyle = '#0B0E11';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cta, 92, 580);

  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(400, 15);
  ctx.fillStyle = '#454C55';
  ctx.fillText('This is a video game. Not financial advice.', 64, 642);

  const cx0 = 745, cy0 = 128, cw = 391, ch = 440;
  ctx.beginPath();
  ctx.roundRect(cx0 - 24, cy0 - 24, cw + 48, ch + 48, 18);
  ctx.fillStyle = '#0E1318';
  ctx.fill();
  ctx.strokeStyle = '#1C232B';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const prices = input.dataPoints.map(d => d.close);
  if (prices.length > 2) {
    const geo = chartGeo(prices, cx0, cy0 + 30, cw, ch - 60);
    ctx.save();
    ctx.strokeStyle = 'rgba(138,147,158,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx0, cy0 + 30 + ((ch - 60) / 4) * i);
      ctx.lineTo(cx0 + cw, cy0 + 30 + ((ch - 60) / 4) * i);
      ctx.stroke();
    }
    ctx.restore();
    const lineColor = input.isStartup ? '#5066FB' : (prices[prices.length - 1] >= prices[0] ? green : red);
    fillSeries(ctx, prices, geo, input.isStartup ? 'rgba(80,102,251,0.18)' : (prices[prices.length - 1] >= prices[0] ? 'rgba(46,189,133,0.16)' : 'rgba(246,70,93,0.16)'), cy0 + ch - 20);
    strokeSeries(ctx, prices, geo, lineColor, 3, 12);
    drawEvents(ctx, input, prices, geo, cy0, 24);
    const lx = geo.toX(prices.length - 1), ly = geo.toY(prices[prices.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 10, 0, Math.PI * 2); ctx.fillStyle = lineColor + '44'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
  }
  ctx.font = mono(500, 16);
  ctx.fillStyle = '#5C6570';
  ctx.textAlign = 'left';
  ctx.fillText(trackLabel(input), cx0, cy0 + ch + 4);

  return canvas;
}

async function renderTerminal(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 1200, H = 675;
  const { canvas, ctx } = mkCanvas(W, H);
  const amber = '#FFB000';
  const dim = '#8A6200';

  ctx.fillStyle = '#080602';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = amber;
  ctx.fillRect(0, 0, W, 54);
  ctx.fillStyle = '#080602';
  ctx.font = mono(800, 24);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setLS(ctx, 2);
  ctx.fillText('DALALRIDER NSE TERMINAL', 40, 29);
  ctx.textAlign = 'right';
  ctx.font = mono(700, 19);
  ctx.fillText('<RIDE> <GO>', W - 40, 29);
  setLS(ctx, 0);

  ctx.textAlign = 'left';
  ctx.font = mono(500, 20);
  ctx.fillStyle = amber;
  const secLabel = input.isStartup ? `${input.name.toUpperCase()} STARTUP REVENUE` : `${input.ticker} NSE EQUITY`;
  ctx.fillText(`${secLabel}  |  PERIOD ${input.period.toUpperCase()}  |  RIDER ${input.nickname.toUpperCase()}`, 40, 96);
  ctx.strokeStyle = dim;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 118); ctx.lineTo(W - 40, 118); ctx.stroke();

  const termTricks = tricksLine(input, 2);
  const fields: [string, string, string?, number?][] = [
    ['TIME', formatTime(input.time)],
    ['CRASHES', String(input.crashes), input.crashes >= 10 ? '#FF5A5A' : undefined],
    ['STREAK', `x${input.maxStreak}`],
    ['RANK', input.worldRecord ? '#1 WORLD' : rankLine(input.score)],
  ];
  if (termTricks) fields.push(['TRICKS', termTricks, undefined, 19]);
  let fy = 175;
  for (const [label, value, color, size] of fields) {
    ctx.font = mono(500, 17);
    ctx.fillStyle = dim;
    ctx.fillText(label, 40, fy);
    ctx.font = mono(700, size || 30);
    ctx.fillStyle = color || '#F4EFDD';
    ctx.fillText(value, 200, fy);
    fy += 56;
  }

  ctx.font = mono(500, 17);
  ctx.fillStyle = dim;
  ctx.fillText('SCORE', 40, 452);
  ctx.font = mono(800, 96);
  ctx.fillStyle = amber;
  ctx.save();
  ctx.shadowColor = amber;
  ctx.shadowBlur = 24;
  const scoreStr = fmtScore(input.score);
  ctx.fillText(scoreStr, 34, 545);
  const sw = ctx.measureText(scoreStr).width;
  ctx.fillRect(34 + sw + 16, 545 - 68, 34, 76);
  ctx.restore();

  ctx.font = mono(700, 22);
  ctx.fillStyle = input.disaster ? '#FF5A5A' : '#F4EFDD';
  ctx.fillText(`VERDICT: ${verdict(input)}${input.worldRecord ? ' ♛' : ''}`, 40, 596);

  const cx0 = 700, cy0 = 160, cw = 460, ch = 380;
  ctx.strokeStyle = dim;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx0 - 16, cy0 - 16, cw + 32, ch + 32);
  ctx.font = mono(500, 15);
  ctx.fillStyle = dim;
  ctx.fillText(trackLabel(input), cx0 - 16, cy0 - 28);
  const prices = input.dataPoints.map(d => d.close);
  if (prices.length > 2) {
    const geo = chartGeo(prices, cx0, cy0 + 20, cw, ch - 40);
    ctx.save();
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(255,176,0,0.18)';
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx0, cy0 + 20 + ((ch - 40) / 3) * i);
      ctx.lineTo(cx0 + cw, cy0 + 20 + ((ch - 40) / 3) * i);
      ctx.stroke();
    }
    ctx.restore();
    strokeSeries(ctx, prices, geo, amber, 2.5, 10);
    drawEvents(ctx, input, prices, geo, cy0, 22);
  }

  ctx.fillStyle = amber;
  ctx.fillRect(0, H - 54, W, 54);
  ctx.fillStyle = '#080602';
  ctx.font = mono(700, 20);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('F1:RIDE   F8:BEAT THIS RUN', 40, H - 27);
  ctx.textAlign = 'right';
  ctx.font = mono(800, 20);
  ctx.fillText(trackUrl(input).toUpperCase(), W - 40, H - 27);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  return canvas;
}

const TRICK_BASE: Record<string, number> = {
  Flip: 500, Superman: 250, 'Dead Sailor': 150, 'No-Hander': 300,
  Wheelie: 300, Stoppie: 400, 'Speed Demon': 200, 'Penny Pincher': 350,
  'Cliff Hanger': 250, Astronaut: 500, Showoff: 500, Madman: 500, 'Kiss the Moon': 500,
};

async function renderReceipt(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 940, H = 1240;
  const { canvas, ctx } = mkCanvas(W, H);
  const rnd = mulberry32(seedOf(input));

  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, H);
  vg.addColorStop(0, 'rgba(255,255,255,0.03)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const rw = 620, rx = (W - rw) / 2, ry = 66, rh = H - 132;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.018);
  ctx.translate(-W / 2, -H / 2);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  ctx.beginPath();
  const tooth = 18;
  ctx.moveTo(rx, ry);
  for (let x = rx; x < rx + rw; x += tooth) {
    ctx.lineTo(x + tooth / 2, ry - 9);
    ctx.lineTo(x + tooth, ry);
  }
  ctx.lineTo(rx + rw, ry + rh);
  for (let x = rx + rw; x > rx; x -= tooth) {
    ctx.lineTo(x - tooth / 2, ry + rh + 9);
    ctx.lineTo(x - tooth, ry + rh);
  }
  ctx.closePath();
  ctx.fillStyle = '#FBFAF4';
  ctx.fill();
  ctx.restore();

  const ink = '#1B1B1E';
  const faded = '#5A5A60';
  const left = rx + 44, right = rx + rw - 44;
  let y = ry + 74;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = mono(800, 42);
  setLS(ctx, 6);
  ctx.fillText('DALALRIDER', rx + rw / 2, y);
  setLS(ctx, 0);
  y += 34;
  ctx.font = mono(500, 17);
  ctx.fillStyle = faded;
  ctx.fillText('* OFFICIAL RIDE RECEIPT *', rx + rw / 2, y);
  y += 24;
  ctx.font = mono(400, 14);
  ctx.fillText('DALALRIDER · NSE & BSE ARCADE · BY SISONPIY-DROID', rx + rw / 2, y);
  y += 34;

  const metaRow = (label: string, value: string) => {
    ctx.font = mono(400, 16);
    ctx.fillStyle = faded;
    ctx.textAlign = 'left';
    ctx.fillText(label, left, y);
    ctx.font = mono(700, 16);
    ctx.fillStyle = ink;
    ctx.textAlign = 'right';
    ctx.fillText(value, right, y);
    y += 26;
  };
  const now = new Date();
  metaRow('DATE', now.toISOString().slice(0, 10));
  metaRow('RIDER', input.nickname.toUpperCase());
  metaRow('TRACK', input.isStartup ? `${input.name.toUpperCase()} (REVENUE)` : `${input.ticker} (${input.period.toUpperCase()})`);
  metaRow('CASHIER', 'THE MARKET');
  y += 6;
  dashedLine(ctx, left, y, right, '#B9B9BE', 2);
  y += 34;

  const itemRow = (label: string, value: string, bold = false) => {
    ctx.font = mono(bold ? 700 : 500, 17);
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.fillText(label, left, y);
    ctx.textAlign = 'right';
    ctx.fillText(value, right, y);
    y += 28;
  };
  const trickEntries = Object.entries(input.tricks).filter(([, c]) => c > 0).slice(0, 6);
  let itemsTotal = 0;
  for (const [name, count] of trickEntries) {
    const pts = (TRICK_BASE[name] || 200) * count;
    itemsTotal += pts;
    itemRow(`${name.toUpperCase()} x${count}`, pts.toLocaleString());
  }
  const baseRide = Math.max(0, input.score - itemsTotal);
  itemRow('DISTANCE RIDDEN', baseRide.toLocaleString());
  if (input.maxStreak > 1) itemRow(`STREAK MULTIPLIER x${input.maxStreak}`, 'APPLIED');
  itemRow(`CRASH FEE x${input.crashes}`, input.crashes === 0 ? 'N/A' : 'ON THE HOUSE');
  y += 4;
  dashedLine(ctx, left, y, right, '#B9B9BE', 2);
  y += 42;

  ctx.font = mono(800, 34);
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL', left, y);
  ctx.textAlign = 'right';
  ctx.fillText(`${fmtScore(input.score)} PTS`, right, y);
  y += 34;
  ctx.font = mono(400, 15);
  ctx.fillStyle = faded;
  ctx.textAlign = 'left';
  ctx.fillText(`TIME ${formatTime(input.time)}`, left, y);
  ctx.textAlign = 'right';
  ctx.fillText(input.worldRecord ? 'RANK: #1 WORLD' : `${rankLine(input.score)} WORLDWIDE`, right, y);
  y += 24;
  ctx.textAlign = 'left';
  ctx.fillText(input.disaster ? 'CARD: PAPER HANDS — DECLINED' : 'CARD: DIAMOND HANDS **** 4200', left, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = input.disaster ? '#C0392B' : ink;
  ctx.font = mono(700, 15);
  ctx.fillText(input.disaster ? 'DECLINED' : 'APPROVED', right, y);
  y += 20;
  dashedLine(ctx, left, y, right, '#B9B9BE', 2);
  y += 40;

  const bcW = rw - 200;
  let bx = rx + 100;
  ctx.fillStyle = ink;
  while (bx < rx + 100 + bcW) {
    const bw = 2 + Math.floor(rnd() * 5);
    if (rnd() > 0.35) ctx.fillRect(bx, y, bw, 74);
    bx += bw + 3;
  }
  y += 98;
  ctx.font = mono(500, 15);
  ctx.fillStyle = faded;
  ctx.textAlign = 'center';
  ctx.fillText(`${input.isStartup ? (input.slug || input.ticker).toUpperCase() : input.ticker}-${input.period.toUpperCase()}-${input.score}`, rx + rw / 2, y);
  y += 40;

  ctx.font = mono(700, 17);
  ctx.fillStyle = ink;
  ctx.fillText('*** THANK YOU FOR RIDING ***', rx + rw / 2, y);
  y += 28;
  ctx.font = mono(700, 16);
  ctx.fillText(`BEAT THIS RUN → ${trackUrl(input).toUpperCase()}`, rx + rw / 2, y);

  ctx.restore();

  if (input.disaster) drawStamp(ctx, W / 2, H / 2 + 40, 'TOTAL WIPEOUT', '#C0392B', -0.22, 'NO REFUNDS ISSUED');
  else if (input.worldRecord) drawStamp(ctx, W / 2, H / 2 + 40, 'WORLD RECORD', '#B8860B', -0.18, 'CERTIFIED BY THE MARKET');

  return canvas;
}

interface Rarity { name: string; color: string; grad: string[]; glow: string }
function rarityOf(input: CardInput): Rarity {
  if (input.worldRecord) return { name: 'MYTHIC', color: '#FF4D6D', grad: ['#FF4D6D', '#FFB000', '#FF4D6D'], glow: 'rgba(255,77,109,0.25)' };
  const tp = topPercent(input.score);
  if (tp <= 2) return { name: 'LEGENDARY', color: '#FFC24B', grad: ['#FFE9B0', '#B8860B', '#FFE9B0'], glow: 'rgba(255,194,75,0.22)' };
  if (tp <= 10) return { name: 'EPIC', color: '#B26CF0', grad: ['#E3C7FF', '#7A3DB8', '#E3C7FF'], glow: 'rgba(178,108,240,0.20)' };
  if (tp <= 30) return { name: 'RARE', color: '#4D9FFF', grad: ['#BBDCFF', '#2461B8', '#BBDCFF'], glow: 'rgba(77,159,255,0.18)' };
  if (tp <= 60) return { name: 'UNCOMMON', color: '#5DCAA5', grad: ['#BFF0DD', '#2E8065', '#BFF0DD'], glow: 'rgba(93,202,165,0.15)' };
  return { name: 'COMMON', color: '#9AA3AF', grad: ['#D5DAE0', '#5C646E', '#D5DAE0'], glow: 'rgba(154,163,175,0.10)' };
}

async function renderHolo(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 940, H = 1240;
  const { canvas, ctx } = mkCanvas(W, H);
  const rar = rarityOf(input);
  const rnd = mulberry32(seedOf(input));

  ctx.fillStyle = '#0A0A10';
  ctx.fillRect(0, 0, W, H);
  const bgGlow = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, H * 0.75);
  bgGlow.addColorStop(0, rar.glow);
  bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, W, H);

  const cx = 80, cy = 56, cw = W - 160, ch = H - 112;
  const borderGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
  borderGrad.addColorStop(0, rar.grad[0]);
  borderGrad.addColorStop(0.5, rar.grad[1]);
  borderGrad.addColorStop(1, rar.grad[2]);
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 30);
  ctx.fillStyle = borderGrad;
  ctx.save();
  ctx.shadowColor = rar.color;
  ctx.shadowBlur = 50;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(cx + 10, cy + 10, cw - 20, ch - 20, 22);
  ctx.fillStyle = '#111118';
  ctx.fill();

  const pad = 52;
  const ix = cx + pad, iw = cw - pad * 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(800, 44);
  ctx.fillStyle = '#F4F4F6';
  const title = input.isStartup ? input.name : input.ticker;
  ctx.fillText(title.length > 12 ? title.slice(0, 12) : title, ix, cy + 96);
  ctx.textAlign = 'right';
  ctx.font = mono(800, 44);
  ctx.fillStyle = rar.color;
  ctx.fillText(fmtScore(input.score), cx + cw - pad, cy + 96);
  ctx.font = mono(500, 16);
  ctx.fillStyle = '#74747F';
  ctx.fillText('PTS', cx + cw - pad, cy + 122);
  ctx.textAlign = 'left';
  ctx.font = mono(500, 18);
  ctx.fillStyle = '#74747F';
  ctx.fillText(
    input.isStartup
      ? `${input.name} · REVENUE · ${input.period.toUpperCase()}`
      : `${input.name} · ${input.period.toUpperCase()} · ${input.difficulty.toUpperCase()}`,
    ix, cy + 132,
  );

  const ax = ix, ay = cy + 165, aw = iw, ah = 430;
  ctx.beginPath();
  ctx.roundRect(ax, ay, aw, ah, 14);
  const sky = ctx.createLinearGradient(0, ay, 0, ay + ah);
  sky.addColorStop(0, '#0B0E20');
  sky.addColorStop(1, '#131320');
  ctx.fillStyle = sky;
  ctx.fill();
  ctx.strokeStyle = rar.color + '66';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ax, ay, aw, ah, 14);
  ctx.clip();
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.4})`;
    ctx.fillRect(ax + rnd() * aw, ay + rnd() * ah * 0.6, 2, 2);
  }
  const prices = input.dataPoints.map(d => d.close);
  if (prices.length > 2) {
    const geo = chartGeo(prices, ax + 24, ay + 60, aw - 48, ah - 120);
    fillSeries(ctx, prices, geo, rar.glow, ay + ah - 30);
    strokeSeries(ctx, prices, geo, rar.color, 3.5, 16);
    drawEvents(ctx, input, prices, geo, ay, 26);
  }
  ctx.restore();

  const flavors: Record<string, string> = {
    'WORLD RECORD': '« The market blinked first. »',
    'TOTAL WIPEOUT': '« Bought the top. Rode it anyway. »',
    'DIAMOND HANDS': '« Zero crashes. Zero fear. Full send. »',
    'MOON CANDIDATE': '« Last seen heading for the moon. »',
    'SURVIVED THE MARKET': '« Volatility is just a vibe. »',
  };
  ctx.font = `italic 400 21px ${MONO}`;
  ctx.fillStyle = '#A3A3AF';
  ctx.textAlign = 'center';
  ctx.fillText(flavors[verdict(input)] || flavors['SURVIVED THE MARKET'], W / 2, ay + ah + 52);

  const stats: [string, string, string][] = [
    ['STREAK', `x${input.maxStreak}`, '#EF9F27'],
    ['TIME', formatTime(input.time), '#F4F4F6'],
    ['CRASHES', String(input.crashes), input.crashes > 0 ? '#E24B4A' : '#5DCAA5'],
  ];
  const bw = (iw - 32) / 3;
  const by = ay + ah + 90;
  for (let i = 0; i < 3; i++) {
    const bx = ix + i * (bw + 16);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 104, 12);
    ctx.fillStyle = '#17171F';
    ctx.fill();
    ctx.strokeStyle = '#26262E';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = mono(500, 15);
    ctx.fillStyle = '#74747F';
    ctx.textAlign = 'center';
    setLS(ctx, 2);
    ctx.fillText(stats[i][0], bx + bw / 2, by + 36);
    setLS(ctx, 0);
    ctx.font = mono(800, 34);
    ctx.fillStyle = stats[i][2];
    ctx.fillText(stats[i][1], bx + bw / 2, by + 80);
  }

  const holoTricks = tricksLine(input);
  if (holoTricks) {
    ctx.font = mono(500, 16);
    ctx.fillStyle = '#74747F';
    ctx.textAlign = 'center';
    ctx.fillText(holoTricks, W / 2, by + 142);
  }

  const ry2 = by + 190;
  ctx.textAlign = 'center';
  ctx.font = mono(800, 46);
  ctx.fillStyle = rar.color;
  setLS(ctx, 10);
  ctx.save();
  ctx.shadowColor = rar.color;
  ctx.shadowBlur = 26;
  ctx.fillText(`◆ ${rar.name} ◆`, W / 2, ry2);
  ctx.restore();
  setLS(ctx, 0);
  ctx.font = mono(500, 16);
  ctx.fillStyle = '#74747F';
  ctx.fillText(`RIDER ${input.nickname.toUpperCase()} · SERIES 1 · ${input.isStartup ? (input.slug || input.ticker).toUpperCase() : input.ticker}-${input.period.toUpperCase()}`, W / 2, ry2 + 36);

  ctx.font = mono(700, 19);
  ctx.fillStyle = '#F4F4F6';
  ctx.fillText(`PULL YOURS → ${trackUrl(input)}`, W / 2, cy + ch - 46);

  if (['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].includes(rar.name)) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx + 10, cy + 10, cw - 20, ch - 20, 22);
    ctx.clip();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.5);
    for (let i = -3; i <= 3; i++) {
      const sx = i * 220 + 40;
      const stripe = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
      stripe.addColorStop(0, 'rgba(255,255,255,0)');
      stripe.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      stripe.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = stripe;
      ctx.fillRect(sx - 60, -H, 120, H * 2);
    }
    ctx.restore();
    for (let i = 0; i < 22; i++) {
      sparkle(ctx, cx + 20 + rnd() * (cw - 40), cy + 20 + rnd() * (ch - 40), 3 + rnd() * 5, '#FFFFFF', 0.25 + rnd() * 0.4);
    }
  }

  return canvas;
}

async function renderPoster(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 1200, H = 920;
  const { canvas, ctx } = mkCanvas(W, H);
  const rnd = mulberry32(seedOf(input));
  const accent = input.isStartup ? '#5066FB' : (input.disaster ? '#E24B4A' : '#5DCAA5');

  ctx.fillStyle = '#0D0D11';
  ctx.fillRect(0, 0, W, H);

  for (let gy = 0; gy < 14; gy++) {
    for (let gx = 0; gx < 22; gx++) {
      const x = W - 30 - gx * 26;
      const yy = 30 + gy * 26;
      const r = Math.max(0, 5.5 - gx * 0.24 - gy * 0.22);
      if (r > 0.4) {
        ctx.beginPath();
        ctx.arc(x, yy, r, 0, Math.PI * 2);
        ctx.fillStyle = accent + '30';
        ctx.fill();
      }
    }
  }
  ctx.save();
  ctx.strokeStyle = accent + '22';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const ly = 100 + rnd() * 500;
    const lx = rnd() * 300;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 90 + rnd() * 140, ly - 14);
    ctx.stroke();
  }
  ctx.restore();

  const prices = input.dataPoints.map(d => d.close);
  if (prices.length > 2) {
    const geo = chartGeo(prices, -20, 600, W + 40, 220);
    tracePath(ctx, prices, geo);
    ctx.lineTo(W + 20, H);
    ctx.lineTo(-20, H);
    ctx.closePath();
    ctx.fillStyle = '#16161D';
    ctx.fill();
    strokeSeries(ctx, prices, geo, accent, 4, 22);
    drawEvents(ctx, input, prices, geo, 560, 26);
  }

  const title = input.worldRecord ? 'WORLD RECORD!' : input.disaster ? 'WIPEOUT!' : 'FINISHED!';
  ctx.save();
  ctx.translate(90, 200);
  ctx.rotate(-0.055);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = impact(input.worldRecord ? 106 : 128);
  ctx.fillStyle = accent;
  ctx.fillText(title, 8, 8);
  ctx.fillStyle = '#F4F4F6';
  ctx.fillText(title, 0, 0);
  ctx.restore();

  ctx.font = mono(700, 25);
  ctx.fillStyle = '#EF9F27';
  ctx.textAlign = 'left';
  setLS(ctx, 4);
  const gpName = input.isStartup ? input.name.toUpperCase() : input.ticker;
  ctx.fillText(`${gpName} GRAND PRIX — ${input.period.toUpperCase()} CIRCUIT`, 96, 266);
  setLS(ctx, 0);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.font = impact(190);
  const scoreStr = fmtScore(input.score);
  ctx.fillStyle = accent;
  ctx.fillText(scoreStr, 96 + 10, 490 + 10);
  ctx.fillStyle = '#F4F4F6';
  ctx.fillText(scoreStr, 96, 490);
  const sw = ctx.measureText(scoreStr).width;
  ctx.font = impact(44);
  ctx.fillStyle = '#74747F';
  ctx.fillText('PTS', 96 + sw + 22, 490);
  ctx.restore();

  let chipX = 96;
  const chipFont = mono(700, 20);
  const chips: [string, string][] = [
    [`\u{1F525} x${input.maxStreak} STREAK`, '#EF9F27'],
    [`\u{1F480} ${input.crashes} CRASH${input.crashes === 1 ? '' : 'ES'}`, '#E24B4A'],
    [`⏱ ${formatTime(input.time)}`, '#A3A3AF'],
    [input.worldRecord ? '\u{1F451} #1 WORLD' : rankLine(input.score), accent],
  ];
  for (const [text, color] of chips) {
    chipX += pill(ctx, chipX, 528, text, chipFont, color, 'rgba(13,13,17,0.85)', 16, 10, color + '66') + 14;
  }

  const posterTricks = tricksLine(input);
  if (posterTricks) {
    pill(ctx, 96, 582, `TRICKS: ${posterTricks}`, mono(600, 17), '#A3A3AF', 'rgba(13,13,17,0.85)', 14, 8);
  }

  drawStamp(ctx, W - 300, 140, 'OFFICIAL', input.disaster ? '#E24B4A' : '#EF9F27', 0.16, `DALAL STREET GP · RIDER ${input.nickname.toUpperCase().slice(0, 14)}`);

  const bandY = H - 66;
  const sq = 22;
  for (let x = 0; x < W; x += sq) {
    for (let yy = 0; yy < 3; yy++) {
      ctx.fillStyle = ((x / sq + yy) % 2 === 0) ? '#F4F4F6' : '#0D0D11';
      ctx.fillRect(x, bandY + yy * sq, sq, sq);
    }
  }
  ctx.font = mono(800, 23);
  const cta = `RIDE IT YOURSELF → ${trackUrl(input).toUpperCase()}`;
  const ctaW = ctx.measureText(cta).width + 64;
  ctx.beginPath();
  ctx.roundRect((W - ctaW) / 2, bandY - 4, ctaW, 56, 28);
  ctx.fillStyle = '#0D0D11';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#F4F4F6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cta, W / 2, bandY + 25);
  ctx.textBaseline = 'alphabetic';

  return canvas;
}

async function renderReport(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 940, H = 1240;
  const { canvas, ctx } = mkCanvas(W, H);
  const rnd = mulberry32(seedOf(input));
  const paper = '#EDE7D4', ink = '#25252A', inkSoft = '#55555C', red = '#B8332A';

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(90,70,40,${rnd() * 0.05})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(80,60,30,0.14)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const left = 90, right = W - 90;

  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(150, 130, 46, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(150, 130, 38, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `34px ${MONO}${EMOJI_FALLBACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.fillText('★', 150, 132);
  ctx.textBaseline = 'alphabetic';

  ctx.font = mono(700, 30);
  ctx.fillStyle = ink;
  setLS(ctx, 4);
  ctx.fillText('MARKET PATROL DIVISION', (left + right) / 2 + 40, 116);
  setLS(ctx, 0);
  ctx.font = mono(500, 19);
  ctx.fillStyle = inkSoft;
  ctx.fillText('OFFICIAL INCIDENT REPORT', (left + right) / 2 + 40, 148);
  ctx.font = mono(400, 15);
  ctx.fillText(`CASE No. SR-${input.ticker}-${input.period.toUpperCase()}-${String(input.score).padStart(6, '0')}`, (left + right) / 2 + 40, 174);

  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(left, 208); ctx.lineTo(right, 208); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, 214); ctx.lineTo(right, 214); ctx.stroke();

  let y = 262;
  const field = (label: string, value: string) => {
    ctx.textAlign = 'left';
    ctx.font = mono(500, 14);
    ctx.fillStyle = inkSoft;
    ctx.fillText(label, left, y);
    ctx.font = mono(700, 22);
    ctx.fillStyle = ink;
    ctx.fillText(value, left + 240, y);
    ctx.save();
    ctx.strokeStyle = 'rgba(37,37,42,0.35)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(left + 240, y + 8);
    ctx.lineTo(right, y + 8);
    ctx.stroke();
    ctx.restore();
    y += 46;
  };
  field('RIDER', input.nickname.toUpperCase());
  field('VEHICLE', 'MOTOCROSS BIKE (UNINSURED)');
  field('LOCATION', input.isStartup ? `${input.name.toUpperCase()} REVENUE CHART` : `${input.ticker} CHART — ${input.period.toUpperCase()} SECTOR`);
  field('RIDE DURATION', formatTime(input.time));

  y += 16;
  ctx.font = mono(700, 15);
  ctx.fillStyle = inkSoft;
  setLS(ctx, 2);
  ctx.fillText('EVIDENCE — EXHIBIT A', left, y);
  setLS(ctx, 0);
  y += 14;
  const evH = 250;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(left, y, right - left, evH);
  const prices = input.dataPoints.map(d => d.close);
  if (prices.length > 2) {
    const geo = chartGeo(prices, left + 24, y + 34, right - left - 48, evH - 68);
    strokeSeries(ctx, prices, geo, ink, 2.5);
    for (const ev of input.events) {
      const idx = Math.min(prices.length - 1, Math.max(0, Math.round(ev.progress * (prices.length - 1))));
      const ex = geo.toX(idx), ey = geo.toY(prices[idx]);
      if (ev.type === 'crash') {
        ctx.strokeStyle = red;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ex - 8, ey - 8); ctx.lineTo(ex + 8, ey + 8);
        ctx.moveTo(ex + 8, ey - 8); ctx.lineTo(ex - 8, ey + 8);
        ctx.stroke();
      } else {
        ctx.font = `22px ${MONO}${EMOJI_FALLBACK}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = ink;
        ctx.fillText('☽', ex, y + 30);
      }
    }
  }
  y += evH + 44;

  ctx.textAlign = 'left';
  ctx.font = mono(700, 15);
  ctx.fillStyle = inkSoft;
  setLS(ctx, 2);
  ctx.fillText('FINDINGS', left, y);
  setLS(ctx, 0);
  y += 34;
  const findings: string[] = [];
  if (input.crashes === 0 && input.finished) findings.push('ZERO CRASHES. DIAMOND HANDS CONFIRMED.');
  if (input.crashes > 0) findings.push(`SUBJECT CRASHED ${input.crashes} TIME${input.crashes > 1 ? 'S' : ''}.${input.crashes >= 10 ? ' PAPER HANDS SUSPECTED.' : ''}`);
  const reportTricks = tricksLine(input, 3);
  if (reportTricks) findings.push(`TRICKS ON RECORD: ${reportTricks.replace(/ · /g, ', ')}.`);
  else if (input.flips > 0) findings.push(`${input.flips} BACKFLIP${input.flips > 1 ? 'S' : ''} AT DANGEROUS ALTITUDE.`);
  if (input.maxStreak > 1) findings.push(`TRICK STREAK x${input.maxStreak} MAINTAINED UNDER FIRE.`);
  if (input.events.some(e => e.type === 'moon')) findings.push('SUBJECT REACHED LUNAR ALTITUDE.');
  if (!input.finished) findings.push('SUBJECT NEVER REACHED THE FINISH LINE.');
  findings.push(`SCORE RANKS IN THE ${rankLine(input.score)} WORLDWIDE.${topPercent(input.score) > 50 ? ' RESPECT.' : ''}`);
  for (const f of findings.slice(0, 5)) {
    ctx.font = mono(500, 19);
    ctx.fillStyle = ink;
    ctx.fillText(`• ${f}`, left, y);
    y += 34;
  }

  y += 18;
  ctx.font = mono(700, 15);
  ctx.fillStyle = inkSoft;
  setLS(ctx, 2);
  ctx.fillText('TOTAL SCORE', left, y);
  setLS(ctx, 0);
  ctx.font = mono(800, 52);
  ctx.fillStyle = ink;
  ctx.fillText(`${fmtScore(input.score)} PTS`, left + 220, y + 8);

  const stampText = input.worldRecord ? 'LEGEND' : input.disaster ? 'REKT' : (input.crashes === 0 && input.finished) ? 'DIAMOND' : 'CLEARED';
  drawStamp(ctx, W - 270, H - 250, stampText, red, -0.24, 'MARKET PATROL');

  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left, H - 116); ctx.lineTo(right, H - 116); ctx.stroke();
  ctx.font = mono(700, 19);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.fillText(`FILE YOUR OWN REPORT → ${trackUrl(input).toUpperCase()}`, W / 2, H - 74);
  ctx.font = mono(400, 14);
  ctx.fillStyle = inkSoft;
  ctx.fillText('DALALRIDER — RIDE DALAL STREET. CRASH RESPONSIBLY.', W / 2, H - 44);

  return canvas;
}

async function renderVersus(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 1200, H = 675;
  const { canvas, ctx } = mkCanvas(W, H);
  const rival = input.challengeScore ?? 0;
  const won = input.score >= rival;
  const green = '#5DCAA5', red = '#E24B4A';
  const accent = input.isStartup ? '#5066FB' : green;

  ctx.fillStyle = '#0C0C0F';
  ctx.fillRect(0, 0, W, H);

  const prices = input.dataPoints.map(d => d.close);
  if (prices.length > 2) {
    const geo = chartGeo(prices, -30, 120, W + 60, 440);
    strokeSeries(ctx, prices, geo, 'rgba(244,244,246,0.06)', 3);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(800, 22);
  ctx.fillStyle = '#F4F4F6';
  setLS(ctx, 2);
  ctx.fillText('DALALRIDER', 60, 66);
  setLS(ctx, 0);
  ctx.textAlign = 'center';
  ctx.font = mono(500, 20);
  ctx.fillStyle = '#A3A3AF';
  setLS(ctx, 4);
  const trackTag = input.isStartup ? `${input.name.toUpperCase()} REVENUE` : `$${input.ticker} · ${input.period.toUpperCase()}`;
  ctx.fillText(`CHALLENGE — ${trackTag}`, W / 2, 118);
  setLS(ctx, 0);
  ctx.textAlign = 'right';
  ctx.font = mono(500, 18);
  ctx.fillStyle = '#74747F';
  ctx.fillText(`@${input.nickname}`, W - 60, 66);

  const panelY = 170, panelH = 300, panelW = 480;
  const drawPanel = (x: number, label: string, name: string, score: number, winner: boolean) => {
    ctx.beginPath();
    ctx.roundRect(x, panelY, panelW, panelH, 20);
    ctx.fillStyle = '#15151A';
    ctx.save();
    if (winner) { ctx.shadowColor = accent; ctx.shadowBlur = 40; }
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = winner ? accent : '#2A2A32';
    ctx.lineWidth = winner ? 3 : 1.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    const cxp = x + panelW / 2;
    ctx.font = mono(500, 16);
    ctx.fillStyle = '#74747F';
    setLS(ctx, 4);
    ctx.fillText(label, cxp, panelY + 48);
    setLS(ctx, 0);
    ctx.font = mono(700, 28);
    ctx.fillStyle = '#F4F4F6';
    ctx.fillText(name.length > 20 ? name.slice(0, 20) : name, cxp, panelY + 92);
    if (winner) {
      ctx.font = `40px ${MONO}${EMOJI_FALLBACK}`;
      ctx.fillText('\u{1F451}', cxp, panelY + 150);
    }
    ctx.font = mono(800, 76);
    ctx.fillStyle = winner ? accent : '#74747F';
    ctx.fillText(fmtScore(score), cxp, panelY + 232);
    ctx.font = mono(500, 17);
    ctx.fillStyle = '#55555F';
    ctx.fillText('PTS', cxp, panelY + 264);
  };
  drawPanel(60, 'YOU', input.nickname, input.score, won);
  drawPanel(W - 60 - panelW, 'THE RIVAL', 'Anonymous rider', rival, !won);

  ctx.beginPath();
  ctx.arc(W / 2, panelY + panelH / 2, 54, 0, Math.PI * 2);
  ctx.fillStyle = '#0C0C0F';
  ctx.fill();
  ctx.strokeStyle = '#F4F4F6';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.font = impact(44);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F4F4F6';
  ctx.fillText('VS', W / 2, panelY + panelH / 2 + 2);
  ctx.textBaseline = 'alphabetic';

  const margin = Math.abs(input.score - rival);
  ctx.font = mono(800, 42);
  ctx.fillStyle = won ? accent : red;
  ctx.textAlign = 'center';
  setLS(ctx, 3);
  ctx.fillText(won ? 'CHALLENGE BEATEN' : 'CHALLENGE FAILED', W / 2, 548);
  setLS(ctx, 0);
  ctx.font = mono(500, 21);
  ctx.fillStyle = '#A3A3AF';
  ctx.fillText(won ? `by ${fmtScore(margin)} pts \u{1F62E}\u{200D}\u{1F4A8}` : `${fmtScore(margin)} pts short \u{1F480}`, W / 2, 584);

  ctx.font = mono(800, 22);
  const cta = `YOUR TURN → ${trackUrl(input)}`;
  const ctaW = ctx.measureText(cta).width + 56;
  ctx.beginPath();
  ctx.roundRect((W - ctaW) / 2, 612, ctaW, 46, 23);
  ctx.fillStyle = won ? accent : red;
  ctx.fill();
  ctx.fillStyle = '#0C0C0F';
  ctx.textBaseline = 'middle';
  ctx.fillText(cta, W / 2, 636);
  ctx.textBaseline = 'alphabetic';

  return canvas;
}

export const CARD_VARIANTS: CardVariant[] = [
  {
    id: 'versus',
    title: 'Versus',
    tagline: 'Duel frontal : « YOU vs THE RIVAL » + marge de victoire. Le format 1v1 humilie ou motive — boucle de revanche infinie entre amis.',
    width: 1200, height: 675, render: renderVersus, requiresChallenge: true,
  },
  {
    id: 'pnl',
    title: 'PnL Flex',
    tagline: 'Format screenshot de PnL (Binance/Robinhood) — le mème le plus partagé du fintwit. Compris en 0,5 s dans le feed. Statut + flex + « not financial advice ».',
    width: 1200, height: 675, render: renderPnl,
  },
  {
    id: 'terminal',
    title: 'Terminal',
    tagline: 'Esthétique Bloomberg = signal d’initié finance. Identité que les gens aiment afficher. Contraste ambre/noir ultra-lisible en vignette X.',
    width: 1200, height: 675, render: renderTerminal,
  },
  {
    id: 'receipt',
    title: 'Receipt',
    tagline: 'Format Receiptify — un des plus viraux de l’histoire d’Instagram/X. L’humour des line-items (« CRASH FEE: ON THE HOUSE ») force la lecture jusqu’au bout.',
    width: 940, height: 1240, render: renderReceipt,
  },
  {
    id: 'holo',
    title: 'Trading Card',
    tagline: 'Rareté réelle (percentile) : COMMON → MYTHIC. « J’ai pull un LEGENDARY » déclenche collection, comparaison et rejouabilité.',
    width: 940, height: 1240, render: renderHolo,
  },
  {
    id: 'poster',
    title: 'Race Poster',
    tagline: 'Énergie sport/arcade : score géant lisible en miniature, tampon « OFFICIAL », drapeau à damier. Donne une raison sociale de poster son résultat.',
    width: 1200, height: 920, render: renderPoster,
  },
  {
    id: 'report',
    title: 'Incident Report',
    tagline: 'Auto-dérision : transforme les runs ratés (12 % du volume, aujourd’hui enterrés) en contenu comique — tampon REKT, « PAPER HANDS SUSPECTED ».',
    width: 940, height: 1240, render: renderReport,
  },
];
