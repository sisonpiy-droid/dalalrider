import Matter from 'matter-js';
import { DataPoint, GhostFrame, incrementStats } from '../data/TickerData';
import { generateTerrainFromData, createTerrainBodies, drawTerrain, TerrainPoint, TrendZone, yToPrice } from '../terrain';
import { navigate, navigateIpo, navigateTrustMrr } from '../ui/Router';
import { createBike, accelerate, brake, leanForward, leanBack, jump, isRearGrounded, isFrontGrounded, getContactAngle, drawBike, drawGhostBike, drawOpponentBike, drawRagdoll, resetBike, stabilizeBike, Bike } from '../bike';
import { mp } from '../multiplayer';
import { Camera } from '../camera';
import { startEngine, updateEngine, stopEngine, playCrash, playLanding, playTrick, playFinish, playCombo, playNos, playMoonReached, playNamedCombo, playOpeningBell, preloadBell, isMuted, toggleMute, playStreakUp, playStreakLost, playPerfectLanding, playCoin } from '../sound';

export interface GameCallbacks {
  onFinish: (stats: GameStats) => void;
  onGhostReady?: (frames: GhostFrame[]) => void;
}

export interface GameEvent {
  type: 'crash' | 'moon';
  progress: number;
}

export interface GameStats {
  score: number;
  flips: number;
  crashes: number;
  maxStreak: number;
  finished: boolean;
  time: number;
  timeToFirstCrash: number;
  tricks: Record<string, number>;
  events: GameEvent[];
  coins?: number;
  coinsTotal?: number;
}

export interface GameOptions {
  smooth?: boolean;
  showPriceMarkers?: boolean;
  showTrendColors?: boolean;
  showMarketEvents?: boolean;
  challengeScore?: number;
  ghostFrames?: GhostFrame[];
  tombstone?: { label: string; years: string };
  ipo?: boolean;
  hudIcon?: string;
  hudName?: string;
  isTrustMrr?: boolean;
  founderPicUrl?: string;
  skipGate?: boolean;
  multiplayer?: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  elapsed: number;
  duration: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

let ghostReplay: GhostFrame[] | null = null;
let ghostTrackKey: string | null = null;

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startGame(
  container: HTMLElement,
  dataPoints: DataPoint[],
  ticker: string,
  period: string,
  callbacks: GameCallbacks,
  options: GameOptions = {}
) {
  preloadBell();
  container.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="game-hud">
      <div>${options.hudIcon ? `<img src="${options.hudIcon}" alt="" style="width:22px;height:22px;border-radius:5px;vertical-align:-5px;margin-right:6px">` : ''}${options.hudName || ticker} · ${period.toUpperCase()}</div>
      <div class="hud-score-row"><span id="hud-score">0</span> <span class="hud-pts">pts</span><span id="hud-streak" data-level="1"></span></div>
      ${options.challengeScore ? `<div class="hud-target">Target: ${options.challengeScore.toLocaleString()} pts</div>` : ''}
      <div id="hud-price-row">${options.isTrustMrr ? 'Total revenue: ' : ''}<span id="hud-price" style="font-family:monospace"></span></div>
      <div id="hud-coins" class="hud-coins-chip${options.isTrustMrr ? ' startup' : ''}"><span class="hcc-icon">₹</span><span id="hud-coins-count"></span></div>
    </div>
    <button id="pause-btn" class="mobile-only"><ion-icon name="pause"></ion-icon></button>
    <div id="game-timer">0:00.0</div>
    <button id="reset-btn" class="mobile-only"><span>↺</span></button>
    <div id="game-progress"></div>
    <div id="controls-hint" class="desktop-only">
      <div><kbd>↑</kbd> gas</div>
      <div><kbd>Shift / N</kbd> nitro</div>
      <div><kbd>←</kbd> wheelie</div>
      <div><kbd>→</kbd> nose dive</div>
      <div><kbd>Space</kbd> jump</div>
      <div><kbd>R</kbd> reset</div>
      <div><kbd>M</kbd> mute</div>
    </div>
    <div id="touch-controls" class="mobile-only${options.isTrustMrr ? ' startup' : ''}" aria-hidden="true">
      <div class="tc-zone tc-dive" id="tc-dive"><div class="tc-halo"></div><span>NOSE DIVE</span></div>
      <div class="tc-zone tc-wheelie" id="tc-wheelie"><div class="tc-halo"></div><span>WHEELIE</span></div>
      <div class="tc-zone tc-gas" id="tc-gas"><div class="tc-halo"></div><span>GAS</span></div>
      <div class="tc-divider"></div>
    </div>
    <div id="game-brand">DALALRIDER · NSE/BSE</div>
    <button id="mute-btn"><ion-icon name="${isMuted() ? 'volume-mute' : 'volume-high'}"></ion-icon></button>
    <button id="nos-btn" class="mobile-only nos-ready"><ion-icon name="rocket-outline"></ion-icon><span id="nos-cd"></span></button>
    ${!options.skipGate ? `<div id="touch-tutorial" class="mobile-only" style="display:none">
      <div class="tt-zone tt-tl">NOSE DIVE</div>
      <div class="tt-zone tt-tr">GAS</div>
      <div class="tt-zone tt-bl">WHEELIE</div>
      <div class="tt-zone tt-br">GAS</div>
      <div class="tt-center">TAP = JUMP</div>
      <div class="tt-dismiss">Hold GAS (right side) to start</div>
    </div>` : ''}
    <div id="tut-banner" style="display:none"></div>
    <div id="mp-hud-board" style="display:none;position:fixed;top:62px;right:14px;background:rgba(12,12,18,0.86);border:1px solid #2a2a34;border-radius:8px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:11px;z-index:25;min-width:165px;pointer-events:none"></div>
    <div id="mp-winner-toast" style="display:none;position:fixed;top:18%;left:50%;transform:translateX(-50%);background:rgba(12,12,18,0.94);border:2px solid #FF9933;border-radius:12px;padding:12px 24px;font-family:'JetBrains Mono',monospace;text-align:center;z-index:35;box-shadow:0 8px 32px rgba(0,0,0,0.6);pointer-events:none"></div>
  `;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const hudScore = document.getElementById('hud-score')!;
  const hudAir = document.getElementById('hud-air');
  const hudTimer = document.getElementById('game-timer')!;
  const hudPrice = document.getElementById('hud-price')!;
  const hudCoins = document.getElementById('hud-coins');
  const hudCoinsCount = document.getElementById('hud-coins-count');
  const hudStreak = document.getElementById('hud-streak')!;
  hudStreak.addEventListener('animationend', (e) => {
    const name = (e as AnimationEvent).animationName;
    if (name === 'streak-pop') hudStreak.classList.remove('streak-pop');
    if (name === 'streak-break') { hudStreak.classList.remove('streak-lost'); hudStreak.classList.toggle('visible', streak > 1); }
  });
  const referencePrice = dataPoints[0].close;
  let displayedPrice = options.isTrustMrr ? 0 : referencePrice;
  const cumulativeRevenue: number[] = [];
  if (options.isTrustMrr) {
    let sum = 0;
    for (const dp of dataPoints) { sum += dp.close; cumulativeRevenue.push(sum); }
  }
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => restartGame());
  const muteBtn = document.getElementById('mute-btn')!;
  muteBtn.addEventListener('click', () => {
    const m = toggleMute();
    muteBtn.innerHTML = `<ion-icon name="${m ? 'volume-mute' : 'volume-high'}"></ion-icon>`;
  });

  let nosLeanDir = 0;
  let nosTouchId: number | null = null;
  let nosTouchStartY = 0;
  const NOS_SLIDE_THRESHOLD = 16;
  const touch = { gas: false, leanBack: false, leanForward: false, jump: false, nos: false };
  const nosBtn = document.getElementById('nos-btn');
  if (nosBtn) {
    nosBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touch.nos = true;
      const t = e.changedTouches[0];
      nosTouchId = t.identifier;
      nosTouchStartY = t.clientY;
      nosLeanDir = 0;
    });
    nosBtn.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== nosTouchId) continue;
        const dy = t.clientY - nosTouchStartY;
        nosLeanDir = dy < -NOS_SLIDE_THRESHOLD ? -1 : dy > NOS_SLIDE_THRESHOLD ? 1 : 0;
      }
    });
    const endNos = (e: TouchEvent) => { e.preventDefault(); touch.nos = false; nosLeanDir = 0; nosTouchId = null; };
    nosBtn.addEventListener('touchend', endNos);
    nosBtn.addEventListener('touchcancel', endNos);
  }

  const nosCd = document.getElementById('nos-cd');
  const tcDive = document.getElementById('tc-dive');
  const tcWheelie = document.getElementById('tc-wheelie');
  const tcGas = document.getElementById('tc-gas');
  let tcDiveHeldSince = 0;
  let tcWheelieHeldSince = 0;

  let tutorialActive = false;
  let dismissTutorial: (() => void) | null = null;
  let tutGasHoldMs = 0;
  let tutStep: 'jump' | 'lean' | 'done' | null =
    ('ontouchstart' in window && !localStorage.getItem('dalalrider_tutorial_done')) ? 'jump' : null;
  let tutDoneAt = 0;
  let lastTutText = '';
  const tutBanner = document.getElementById('tut-banner');
  const touchTutorial = document.getElementById('touch-tutorial');
  if (touchTutorial && 'ontouchstart' in window && !options.skipGate) {
    touchTutorial.style.display = 'flex';
    tutorialActive = true;
    dismissTutorial = () => {
      if (!tutorialActive) return;
      touchTutorial.style.opacity = '0';
      setTimeout(() => { touchTutorial.remove(); }, 400);
      window.removeEventListener('keydown', dismissTutorial!);
      tutorialActive = false;
      touch.jump = false;
      preloadBell().then(() => playOpeningBell());
    };
    window.addEventListener('keydown', dismissTutorial);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const isTouchDevice = 'ontouchstart' in window;
  const buzz = (pattern: number | number[]) => { if (isTouchDevice) { try { navigator.vibrate?.(pattern); } catch {  } } };
  const onFullscreenExit = () => {
    if (!document.fullscreenElement) {
      document.removeEventListener('fullscreenchange', onFullscreenExit);
      navigate('landing');
    }
  };
  if (isTouchDevice) {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().then(() => {
        (screen.orientation as any)?.lock?.('landscape').catch(() => {});
        document.addEventListener('fullscreenchange', onFullscreenExit);
      }).catch(() => {});
    }
  }

  const engine = Matter.Engine.create({
    gravity: { x: 0, y: 0.55, scale: 0.001 },
    constraintIterations: 4,
    enableSleeping: true,
  });

  const BASE_Y = 500;
  const { points: terrainPoints, priceMapping } = generateTerrainFromData(dataPoints, BASE_Y, options.smooth);
  const terrainSegments = createTerrainBodies(terrainPoints, engine.world);
  const allTerrainBodies = terrainSegments.map(s => s.body);
  const totalLength = terrainPoints[terrainPoints.length - 1].x;

  const PEAK_ANGLE_THRESHOLD = Math.PI / 6;
  const sharpPeaks: { x: number; y: number }[] = [];
  for (let i = 1; i < terrainPoints.length - 1; i++) {
    if (terrainPoints[i].y < terrainPoints[i - 1].y && terrainPoints[i].y < terrainPoints[i + 1].y) {
      const aL = Math.atan2(terrainPoints[i].y - terrainPoints[i - 1].y, terrainPoints[i].x - terrainPoints[i - 1].x);
      const aR = Math.atan2(terrainPoints[i + 1].y - terrainPoints[i].y, terrainPoints[i + 1].x - terrainPoints[i].x);
      if (aR - aL > PEAK_ANGLE_THRESHOLD) {
        (allTerrainBodies[i - 1] as any).peakInfo = { peakX: terrainPoints[i].x, side: 'asc' };
        (allTerrainBodies[i] as any).peakInfo = { peakX: terrainPoints[i].x, side: 'desc' };
        sharpPeaks.push({ x: terrainPoints[i].x, y: terrainPoints[i].y });
      }
    }
  }

  const _origPreSolve = (Matter as any).Resolver.preSolvePosition;
  const PEAK_MARGIN = 0;
  (Matter as any).Resolver.preSolvePosition = function(pairs: any) {
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!pair.isActive) continue;
      const info = (pair.bodyA as any).peakInfo || (pair.bodyB as any).peakInfo;
      if (!info) continue;
      const other = (pair.bodyA as any).peakInfo ? pair.bodyB : pair.bodyA;
      if (other.isStatic) continue;
      const ox = other.position.x;
      if (info.side === 'asc' && ox > info.peakX + PEAK_MARGIN) pair.isActive = false;
      else if (info.side === 'desc' && ox < info.peakX - PEAK_MARGIN) pair.isActive = false;
    }
    return _origPreSolve.call(this, pairs);
  };

  const SPAWN_X = 120;
  const spawnY = terrainPoints[0].y - 5;
  const bike = createBike(SPAWN_X, spawnY, engine.world);

  for (let i = 0; i < allTerrainBodies.length; i++) {
    if (allTerrainBodies[i].position.x > SPAWN_X + 400) {
      Matter.Sleeping.set(allTerrainBodies[i], true);
    }
  }

  const camera = new Camera();
  camera.x = SPAWN_X;
  camera.y = spawnY - 100;

  const PARALLAX = 0.25;
  const skyline: { x: number; w: number; h: number }[] = [];
  {
    let sx = -800;
    const end = totalLength * (PARALLAX + 0.05) + 2400;
    while (sx < end) {
      const w = 60 + Math.random() * 120;
      skyline.push({ x: sx, w, h: 80 + Math.random() * 260 });
      sx += w + 20 + Math.random() * 90;
    }
  }
  let bgGradient: CanvasGradient | null = null;
  let bgGradientH = 0;

  function drawCoins(c: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number) {
    if (!coins.length) return;
    const viewL = camX - w;
    const viewR = camX + w;
    c.save();
    c.translate(-camX + w / 2, -camY + h / 2);
    const color = isTrustMrr ? '#00E5FF' : '#FFB300';
    c.font = 'bold 11px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < coins.length; i++) {
      const cn = coins[i];
      if (cn.x < viewL || cn.x > viewR) continue;
      if (cn.taken) {
        const dt = gameTime - cn.takenAt;
        if (dt > 0.18) continue;
        const k = dt / 0.18;
        c.globalAlpha = 1 - k;
        c.beginPath();
        c.arc(cn.x, cn.y, 10 + k * 14, 0, Math.PI * 2);
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.stroke();
        c.globalAlpha = 1;
        continue;
      }
      const y = cn.y + Math.sin(gameTime * 3 + cn.x * 0.02) * 3;
      c.beginPath();
      c.arc(cn.x, y, 10, 0, Math.PI * 2);
      c.fillStyle = 'rgba(12, 14, 16, 0.7)';
      c.fill();
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = color;
      c.fillText('₹', cn.x, y + 0.5);
    }
    c.restore();
  }
  function drawParallax(c: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number) {
    const offX = camX * PARALLAX - w / 2;
    const baseY = h / 2 + (650 - camY) * PARALLAX;
    if (baseY < 0) return;
    c.fillStyle = '#0F1830';
    for (let i = 0; i < skyline.length; i++) {
      const b = skyline[i];
      const sx = b.x - offX;
      if (sx + b.w < 0 || sx > w) continue;
      c.fillRect(sx, baseY - b.h, b.w, Math.min(b.h, h - (baseY - b.h)));
    }
  }

  const startPoleX = 80;
  const endPoleX = totalLength - 1000;
  const startPoleY = terrainPoints[0].y;
  const endPoleY = getTerrainY(terrainPoints, endPoleX);

  const showPriceMarkers = options.showPriceMarkers !== false;
  const showTrendColors = options.showTrendColors !== false;
  const showMarketEvents = options.showMarketEvents === true;
  const isTrustMrr = options.isTrustMrr === true;

  let founderFace: HTMLImageElement | undefined;
  let faceIsLogo = false;
  const logoImg = new Image();
  logoImg.src = './logo.svg';
  logoImg.onload = () => { if (!founderFace) { founderFace = logoImg; faceIsLogo = true; } };
  if (options.founderPicUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { founderFace = img; faceIsLogo = false; };
    img.onerror = () => { if (logoImg.complete && logoImg.naturalWidth) { founderFace = logoImg; faceIsLogo = true; } };
    img.src = options.founderPicUrl;
  }

  const LAUNCHPAD = 400;
  const X_PER_POINT = 100;
  const priceMarkers: { x: number; y: number; price: string; date: string }[] = [];

  const trendZones: TrendZone[] = [];
  if ((showTrendColors || showPriceMarkers) && dataPoints.length > 2) {
    const REVERSAL = 0.07;
    let extremePrice = dataPoints[0].close;
    let extremeIdx = 0;
    let dir: 'up' | 'down' | null = null;
    const pivots: number[] = [0];

    for (let i = 1; i < dataPoints.length; i++) {
      const price = dataPoints[i].close;
      if (dir === null) {
        if (price >= extremePrice * (1 + REVERSAL)) { dir = 'up'; extremePrice = price; extremeIdx = i; }
        else if (price <= extremePrice * (1 - REVERSAL)) { dir = 'down'; extremePrice = price; extremeIdx = i; }
        else if (price > extremePrice) { extremePrice = price; extremeIdx = i; }
        else if (price < extremePrice) { extremePrice = price; extremeIdx = i; }
      } else if (dir === 'up') {
        if (price > extremePrice) { extremePrice = price; extremeIdx = i; }
        else if (price <= extremePrice * (1 - REVERSAL)) {
          pivots.push(extremeIdx);
          dir = 'down'; extremePrice = price; extremeIdx = i;
        }
      } else {
        if (price < extremePrice) { extremePrice = price; extremeIdx = i; }
        else if (price >= extremePrice * (1 + REVERSAL)) {
          pivots.push(extremeIdx);
          dir = 'up'; extremePrice = price; extremeIdx = i;
        }
      }
    }
    pivots.push(dataPoints.length - 1);

    for (let i = 0; i < pivots.length - 1; i++) {
      const startX = LAUNCHPAD + pivots[i] * X_PER_POINT;
      const endX = LAUNCHPAD + pivots[i + 1] * X_PER_POINT;
      const up = dataPoints[pivots[i + 1]].close > dataPoints[pivots[i]].close;
      trendZones.push({ startX, endX, up });
    }
    if (trendZones.length > 0) trendZones[0].startX = 0;
    if (trendZones.length > 0) trendZones[trendZones.length - 1].endX = totalLength + 1000;

    if (!showPriceMarkers) {  }
    else for (const idx of pivots) {
      const wx = LAUNCHPAD + idx * X_PER_POINT;
      const wy = getTerrainY(terrainPoints, wx);
      const p = dataPoints[idx].close;
      const priceStr = p >= 1000 ? `₹${(p / 1000).toFixed(1)}k` : p >= 1 ? `₹${p.toFixed(0)}` : `₹${p.toFixed(2)}`;
      const dateStr = isTrustMrr
        ? new Date(dataPoints[idx].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
        : dataPoints[idx].date.substring(2, 7);
      priceMarkers.push({ x: wx, y: wy, price: priceStr, date: dateStr });
    }
  }

  interface MarketEvent { x: number; y: number; text: string; isCrash: boolean }
  const marketEvents: MarketEvent[] = [];
  if (showMarketEvents && dataPoints.length > 2) {
    const CRASH_THRESHOLD = isTrustMrr ? -0.50 : -0.07;
    const RALLY_THRESHOLD = isTrustMrr ? 1.50 : 0.07;
    for (let i = 1; i < dataPoints.length; i++) {
      const change = (dataPoints[i].close - dataPoints[i - 1].close) / dataPoints[i - 1].close;
      if (change <= CRASH_THRESHOLD || change >= RALLY_THRESHOLD) {
        const wx = LAUNCHPAD + i * X_PER_POINT;
        const wy = getTerrainY(terrainPoints, wx);
        const isCrash = change < 0;
        const pct = `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
        const p = dataPoints[i].close;
        const priceStr = p >= 1000 ? `₹${(p / 1000).toFixed(1)}k` : p >= 1 ? `₹${p.toFixed(0)}` : `₹${p.toFixed(2)}`;
        const text = `${isCrash ? '▼' : '▲'} ${pct} · ${priceStr}`;
        marketEvents.push({ x: wx, y: wy, text, isCrash });
      }
    }
    if (isTrustMrr) {
      const MILESTONES = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];
      const fmtMilestone = (v: number) => v >= 1000000 ? `$${v / 1000000}M` : v >= 1000 ? `$${v / 1000}K` : `$${v}`;
      let lastCrossed = -1;
      for (let i = 1; i < dataPoints.length; i++) {
        for (let m = MILESTONES.length - 1; m >= 0; m--) {
          const threshold = MILESTONES[m];
          if (m <= lastCrossed) continue;
          if (dataPoints[i - 1].close < threshold && dataPoints[i].close >= threshold) {
            const wx = LAUNCHPAD + i * X_PER_POINT;
            const wy = getTerrainY(terrainPoints, wx);
            if (!marketEvents.some(ev => Math.abs(ev.x - wx) < 200)) {
              marketEvents.push({ x: wx, y: wy, text: `🎯 ${fmtMilestone(threshold)}/wk reached`, isCrash: false });
            }
            lastCrossed = m;
            break;
          }
        }
      }
    }
    const EVENT_PROXIMITY = 300;
    for (let i = priceMarkers.length - 1; i >= 0; i--) {
      if (marketEvents.some(ev => Math.abs(ev.x - priceMarkers[i].x) < EVENT_PROXIMITY)) {
        priceMarkers.splice(i, 1);
      }
    }
  }

  let paused = false;
  let pauseOverlay: HTMLElement | null = null;

  function showPauseMenu() {
    if (paused) return;
    paused = true;
    stopEngine();
    pauseOverlay = document.createElement('div');
    pauseOverlay.className = 'pause-overlay';
    pauseOverlay.innerHTML = `
      <div class="pause-card">
        <div class="pause-title">PAUSED</div>
        <button class="btn-primary" id="pause-resume">Resume</button>
        <button class="btn-secondary" id="pause-restart">Restart</button>
        <button class="btn-secondary" id="pause-quit">Quit</button>
      </div>
    `;
    container.appendChild(pauseOverlay);
    pauseOverlay.querySelector('#pause-resume')!.addEventListener('click', hidePauseMenu);
    pauseOverlay.querySelector('#pause-restart')!.addEventListener('click', () => {
      hidePauseMenu();
      restartGame();
    });
    pauseOverlay.querySelector('#pause-quit')!.addEventListener('click', () => {
      if (pauseOverlay) { pauseOverlay.remove(); pauseOverlay = null; }
      cleanup();
      const oldHash = window.location.hash;
      if (options.ipo) navigateIpo(ticker);
      else if (isTrustMrr) navigateTrustMrr(ticker);
      else navigate('pregame', ticker);
      if (window.location.hash === oldHash) window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }

  function hidePauseMenu() {
    if (!paused) return;
    paused = false;
    if (pauseOverlay) { pauseOverlay.remove(); pauseOverlay = null; }
    startEngine();
    lastTimestamp = 0;
    requestAnimationFrame(gameLoop);
  }

  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) pauseBtn.addEventListener('click', () => showPauseMenu());

  const keys: Record<string, boolean> = {};
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (paused) hidePauseMenu(); else showPauseMenu();
      return;
    }
    if (e.code === 'KeyM' || e.key.toLowerCase() === 'm') {
      const m = toggleMute();
      muteBtn.innerHTML = `<ion-icon name="${m ? 'volume-mute' : 'volume-high'}"></ion-icon>`;
      return;
    }
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const activeTouches: Record<number, { side: 'left' | 'right'; startY: number; startTime: number }> = {};

  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const side = t.clientX < window.innerWidth / 2 ? 'left' : 'right';
      activeTouches[t.identifier] = { side, startY: t.clientY, startTime: performance.now() };
      const midY = window.innerHeight / 2;
      if (side === 'left') {
        if (t.clientY >= midY) touch.leanBack = true;
        else touch.leanForward = true;
      } else {
        touch.gas = true;
      }
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const info = activeTouches[t.identifier];
      if (!info) continue;
      const midY = window.innerHeight / 2;
      if (info.side === 'left') {
        touch.leanBack = t.clientY >= midY;
        touch.leanForward = t.clientY < midY;
      }
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const info = activeTouches[t.identifier];
      if (!info) continue;
      if (performance.now() - info.startTime < 200 && Math.abs(t.clientY - info.startY) < 30) {
        touch.jump = true;
      }
      if (info.side === 'left') { touch.leanBack = false; touch.leanForward = false; }
      else { touch.gas = false; }
      delete activeTouches[t.identifier];
    }
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

  let debugFps = 0, debugFpsCounter = 0, debugFpsLast = 0;
  let debugPhysicsSteps = 0, debugPhysicsMs = 0, debugEngineMs = 0, debugRenderMs = 0, debugBodies = 0;
  let debugSlopeAngle = 0;

  let grounded = true;
  let fullyGrounded = false;
  let airTime = 0;
  let totalRotation = 0;
  let lastAngle = 0;
  let flipCount = 0;
  const trackKey = `${ticker}:${period}:${options.smooth ? 's' : 'r'}:${dataPoints.length}`;
  const currentGhost: GhostFrame[] = [];
  const activeGhost = options.ghostFrames || ((ghostTrackKey === trackKey && ghostReplay) ? ghostReplay : null);

  let crashes = 0;
  let maxStreak = 1;
  let streak = 1;
  let displayedStreak = 1;
  let streakJustLost = false;
  let lastNosFill = -1;
  let score = 0;
  let lastTimestamp = 0;
  let running = true;
  let finished = false;
  let invincibleUntil = 0;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  let gameTime = 0;
  let bellPlayed = false;
  const gameEvents: GameEvent[] = [];
  const floatingTexts: FloatingText[] = [];

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles: Particle[] = [];
  const MAX_PARTICLES = 350;
  let shakeMag = 0;
  let crashFlash = 0;
  let crashFreezeUntil = 0;
  let pendingRespawn = false;
  let landingSquash = 0;

  const addShake = (m: number) => { if (!reducedMotion) shakeMag = Math.max(shakeMag, Math.min(16, m)); };

  let ragdoll: { head: Matter.Body; torso: Matter.Body; legs: Matter.Body; armL: Matter.Body; armR: Matter.Body; composite: Matter.Composite } | null = null;
  function removeRagdoll() {
    if (!ragdoll) return;
    Matter.Composite.remove(engine.world, ragdoll.composite);
    ragdoll = null;
  }
  function spawnRagdoll(x: number, y: number, vx: number, vy: number) {
    removeRagdoll();
    const opts = { friction: 0.4, frictionAir: 0.01, restitution: 0.25, collisionFilter: { group: -1 }, label: 'ragdoll' };
    const head = Matter.Bodies.circle(x, y, 7, { ...opts, mass: 0.3 });
    const torso = Matter.Bodies.rectangle(x - 3, y + 17, 8, 24, { ...opts, mass: 0.8 });
    const legs = Matter.Bodies.rectangle(x - 6, y + 38, 7, 20, { ...opts, mass: 0.5 });
    const armL = Matter.Bodies.rectangle(x - 9, y + 14, 5, 16, { ...opts, mass: 0.2 });
    const armR = Matter.Bodies.rectangle(x + 5, y + 14, 5, 16, { ...opts, mass: 0.2 });
    const joint = { stiffness: 0.8, damping: 0.2, length: 1 };
    const neck = Matter.Constraint.create({ bodyA: head, pointA: { x: 0, y: 6 }, bodyB: torso, pointB: { x: 0, y: -12 }, ...joint });
    const hip = Matter.Constraint.create({ bodyA: torso, pointA: { x: 0, y: 12 }, bodyB: legs, pointB: { x: 0, y: -10 }, ...joint });
    const shoulderL = Matter.Constraint.create({ bodyA: torso, pointA: { x: -3, y: -10 }, bodyB: armL, pointB: { x: 0, y: -7 }, ...joint });
    const shoulderR = Matter.Constraint.create({ bodyA: torso, pointA: { x: 3, y: -10 }, bodyB: armR, pointB: { x: 0, y: -7 }, ...joint });
    const composite = Matter.Composite.create();
    Matter.Composite.add(composite, [head, torso, legs, armL, armR, neck, hip, shoulderL, shoulderR]);
    Matter.Composite.add(engine.world, composite);
    for (const [b, kick] of [[head, 1.15], [torso, 1], [legs, 0.9], [armL, 1.05], [armR, 1.1]] as [Matter.Body, number][]) {
      Matter.Body.setVelocity(b, { x: vx * kick + (Math.random() - 0.5) * 2, y: vy * kick - 3 - Math.random() * 2 });
      Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.5);
    }
    ragdoll = { head, torso, legs, armL, armR, composite };
  }

  interface SpawnCfg {
    colors: string[];
    speed: [number, number];
    angle?: [number, number];
    gravity?: number;
    life?: [number, number];
    size?: [number, number];
    vx0?: number;
    vy0?: number;
  }
  function spawnParticles(count: number, x: number, y: number, cfg: SpawnCfg) {
    if (reducedMotion) return;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const ang = cfg.angle ? rnd(cfg.angle[0], cfg.angle[1]) : Math.random() * Math.PI * 2;
      const spd = rnd(cfg.speed[0], cfg.speed[1]);
      const life = cfg.life ? rnd(cfg.life[0], cfg.life[1]) : rnd(0.4, 0.8);
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd + (cfg.vx0 || 0),
        vy: Math.sin(ang) * spd + (cfg.vy0 || 0),
        life, maxLife: life,
        size: cfg.size ? rnd(cfg.size[0], cfg.size[1]) : rnd(2, 4),
        color: cfg.colors[(Math.random() * cfg.colors.length) | 0],
        gravity: cfg.gravity ?? 0,
      });
    }
  }
  function updateAndDrawParticles(c: CanvasRenderingContext2D, dt: number, camX: number, camY: number, w: number, h: number) {
    if (particles.length === 0) return;
    c.save();
    c.translate(-camX + w / 2, -camY + h / 2);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      c.globalAlpha = Math.min(1, (p.life / p.maxLife) * 1.6);
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    c.restore();
  }
  let trickCounts: Record<string, number> = {};
  const countTrick = (name: string) => { trickCounts[name] = (trickCounts[name] || 0) + 1; };
  const streakTag = () => streak > 1 ? ` ×${streak}` : '';
  let peakAirRotation = 0;
  let supermanTime = 0;
  let supermanTriggered = false;
  let supermanFade = 0;
  let wheelieTime = 0;
  let stoppieTime = 0;
  let postCrashAirborne = false;
  let timeToFirstCrash = -1;
  let frameCount = 0;
  const NOS_DURATION = 2.5;
  const NOS_COOLDOWN = 15;
  const NOS_FORCE = 0.008;
  const NOS_STEER_STRENGTH = 0.4;
  let nosActive = false;
  let nosTimer = NOS_DURATION;
  let nosCooldownTimer = 0;
  let moonReached = false;
  let lastNosSound = 0;
  let nosUsedInFlight = false;
  let hadRecentWheelie = false;
  let moonReachedThisFlight = false;
  let speedDemonTime = 0;
  let pennyPincherTime = 0;
  let noHanderTime = 0;
  let noHanderTriggered = false;
  const TERRAIN_PEAK_Y = terrainPoints.reduce((m, p) => Math.min(m, p.y), Infinity);
  const MOON_Y = TERRAIN_PEAK_Y - 800;
  const terrainPeaks: number[] = [];
  for (let i = 1; i < terrainPoints.length - 1; i++) {
    if (terrainPoints[i].y < terrainPoints[i - 1].y && terrainPoints[i].y < terrainPoints[i + 1].y) {
      if (terrainPoints[i].x > LAUNCHPAD && terrainPoints[i].x < totalLength - 1000) {
        terrainPeaks.push(terrainPoints[i].x);
      }
    }
  }

  interface Coin { x: number; y: number; taken: boolean; takenAt: number }
  const COIN_VALUE = 50;
  const coins: Coin[] = [];
  {
    const rnd = mulberry32(hashSeed(trackKey));
    const MIN_GAP = 170;
    for (const px of terrainPeaks) {
      if (rnd() < 0.55) coins.push({ x: px, y: getTerrainY(terrainPoints, px) - (90 + rnd() * 60), taken: false, takenAt: 0 });
    }
    for (let wx = LAUNCHPAD + 150; wx < totalLength - 1100; wx += 210 + rnd() * 150) {
      let clear = true;
      for (let i = 0; i < coins.length; i++) {
        if (Math.abs(coins[i].x - wx) < MIN_GAP) { clear = false; break; }
      }
      if (clear) coins.push({ x: wx, y: getTerrainY(terrainPoints, wx) - 34, taken: false, takenAt: 0 });
    }
    coins.sort((a, b) => a.x - b.x);
  }
  let coinsTaken = 0;
  let coinCursor = 0;
  const PHYSICS_DT = 1000 / 60;
  const STEP_S = PHYSICS_DT / 1000;
  const MAX_STEPS = 4;
  let accumulator = 0;
  const nearbyTerrain: Matter.Body[] = new Array(16);
  let smoothTargetAngle = 0;

  interface BikeBodyState { x: number; y: number; angle: number; }
  interface BikeState { frame: BikeBodyState; rearWheel: BikeBodyState; frontWheel: BikeBodyState; }
  let prevBikeState: BikeState = { frame: { x: 0, y: 0, angle: 0 }, rearWheel: { x: 0, y: 0, angle: 0 }, frontWheel: { x: 0, y: 0, angle: 0 } };

  function saveBikeState(): BikeState {
    const b = (body: Matter.Body) => ({ x: body.position.x, y: body.position.y, angle: body.angle });
    return { frame: b(bike.frame), rearWheel: b(bike.rearWheel), frontWheel: b(bike.frontWheel) };
  }

  function lerpBikeForRender(prev: BikeState, alpha: number) {
    const l = (body: Matter.Body, s: BikeBodyState) => {
      Matter.Body.setPosition(body, { x: s.x + (body.position.x - s.x) * alpha, y: s.y + (body.position.y - s.y) * alpha });
      Matter.Body.setAngle(body, s.angle + (body.angle - s.angle) * alpha);
    };
    l(bike.frame, prev.frame);
    l(bike.rearWheel, prev.rearWheel);
    l(bike.frontWheel, prev.frontWheel);
  }

  function restoreBikeState(state: BikeState) {
    const r = (body: Matter.Body, s: BikeBodyState) => { Matter.Body.setPosition(body, { x: s.x, y: s.y }); Matter.Body.setAngle(body, s.angle); };
    r(bike.frame, state.frame);
    r(bike.rearWheel, state.rearWheel);
    r(bike.frontWheel, state.frontWheel);
  }

  function resetToCheckpoint() {
    const bikeX = bike.frame.position.x;
    let cpIdx = 0;
    for (let i = 0; i < terrainPoints.length; i++) {
      if (terrainPoints[i].x <= bikeX) cpIdx = i;
      else break;
    }
    const REWIND_POINTS = 5;
    cpIdx = Math.max(0, cpIdx - REWIND_POINTS);
    while (cpIdx < terrainPoints.length - 1 && terrainPoints[cpIdx].x < SPAWN_X) {
      cpIdx++;
    }
    const MAX_SLOPE = 0.8;
    const MAX_EXTRA_REWIND = 10;
    const minIdx = Math.max(0, cpIdx - MAX_EXTRA_REWIND);
    let bestIdx = cpIdx;
    let bestSlope = Infinity;
    for (let i = cpIdx; i >= minIdx && i < terrainPoints.length - 1; i--) {
      const dy = Math.abs(terrainPoints[i + 1].y - terrainPoints[i].y);
      const dx = terrainPoints[i + 1].x - terrainPoints[i].x;
      const slope = dy / dx;
      if (slope < bestSlope) { bestSlope = slope; bestIdx = i; }
      if (slope <= MAX_SLOPE) break;
    }
    cpIdx = bestIdx;
    if (terrainPoints[cpIdx].x < SPAWN_X) cpIdx = Math.max(0, terrainPoints.findIndex(p => p.x >= SPAWN_X));
    const cp = terrainPoints[cpIdx];
    const BIKE_HALF_SPAN = 49;
    let respawnY = cp.y - 100;
    for (let attempt = 0; attempt < 20; attempt++) {
      let collides = false;
      for (let dx = -BIKE_HALF_SPAN; dx <= BIKE_HALF_SPAN; dx += 7) {
        const terrY = getTerrainY(terrainPoints, cp.x + dx);
        if (respawnY >= terrY) { collides = true; break; }
      }
      if (!collides) break;
      respawnY -= 40;
    }
    resetBike(bike, cp.x, respawnY);
    camera.x = cp.x;
    camera.y = respawnY - 85;
    grounded = false;
    fullyGrounded = false;
    wheelieTime = 0;
    stoppieTime = 0;
    postCrashAirborne = true;
    speedDemonTime = 0;
    pennyPincherTime = 0;
    noHanderTime = 0;
    noHanderTriggered = false;
    hadRecentWheelie = false;
    nosUsedInFlight = false;
    moonReachedThisFlight = false;
  }

  function restartGame() {
    if (finishTimer !== null) { clearTimeout(finishTimer); finishTimer = null; }
    resetBike(bike, SPAWN_X, spawnY);
    camera.x = SPAWN_X;
    camera.y = spawnY - 100;
    grounded = false;
    fullyGrounded = false;
    airTime = 0;
    totalRotation = 0;
    lastAngle = 0;
    flipCount = 0;
    crashes = 0;
    gameEvents.length = 0;
    maxStreak = 1;
    streak = 1;
    displayedStreak = 1;
    streakJustLost = false;
    hudStreak.classList.remove('visible', 'streak-pop', 'streak-lost');
    score = 0;
    finished = false;
    invincibleUntil = 0;
    gameTime = 0;
    currentGhost.length = 0;
    floatingTexts.length = 0;
    peakAirRotation = 0;
    supermanTime = 0;
    supermanTriggered = false;
    supermanFade = 0;
    wheelieTime = 0;
    stoppieTime = 0;
    postCrashAirborne = true;
    nosActive = false;
    nosTimer = NOS_DURATION;
    nosCooldownTimer = 0;
    lastNosSound = 0;
    moonReached = false;
    trickCounts = {};
    nosUsedInFlight = false;
    displayedPrice = isTrustMrr ? 0 : referencePrice;
    hadRecentWheelie = false;
    moonReachedThisFlight = false;
    speedDemonTime = 0;
    pennyPincherTime = 0;
    noHanderTime = 0;
    noHanderTriggered = false;
    particles.length = 0;
    shakeMag = 0;
    crashFlash = 0;
    crashFreezeUntil = 0;
    pendingRespawn = false;
    landingSquash = 0;
    removeRagdoll();
    for (const cn of coins) { cn.taken = false; cn.takenAt = 0; }
    coinsTaken = 0;
    coinCursor = 0;
  }

  function gameLoop(timestamp: number) {
    if (!running || paused) return;

    const frameDt = lastTimestamp ? (timestamp - lastTimestamp) : PHYSICS_DT;
    lastTimestamp = timestamp;
    accumulator = Math.min(accumulator + frameDt, MAX_STEPS * PHYSICS_DT);

    debugFpsCounter++;
    const perfStart = performance.now();
    if (timestamp - debugFpsLast >= 1000) {
      debugFps = debugFpsCounter; debugFpsCounter = 0; debugFpsLast = timestamp;
      debugBodies = Matter.Composite.allBodies(engine.world).length;
    }

    const mpCountdownLeft = (options.multiplayer && mp.state?.startTime) ? Math.max(0, (mp.state.startTime - Date.now()) / 1000) : 0;
    const gateLock = tutorialActive || mpCountdownLeft > 0;
    const wantsGas = !gateLock && (keys['ArrowUp'] || keys['KeyW'] || touch.gas);
    const zoneLeanBack = !gateLock && (keys['ArrowLeft'] || keys['KeyA'] || touch.leanBack);
    const zoneLeanForward = !gateLock && (keys['ArrowRight'] || keys['KeyD'] || touch.leanForward);
    const wantsLeanBack = zoneLeanBack || (!gateLock && nosLeanDir === 1);
    const wantsLeanForward = zoneLeanForward || (!gateLock && nosLeanDir === -1);
    const leanBackStrength = zoneLeanBack ? 1 : NOS_STEER_STRENGTH;
    const leanForwardStrength = zoneLeanForward ? 1 : NOS_STEER_STRENGTH;
    let wantsJump = !gateLock && (keys['Space'] || touch.jump);
    const wantsNos = !gateLock && (keys['KeyN'] || keys['ShiftLeft'] || keys['ShiftRight'] || touch.nos);
    if (keys['KeyR']) { restartGame(); keys['KeyR'] = false; }

    if (tutorialActive) {
      if (touch.gas) {
        tutGasHoldMs += frameDt;
        if (tutGasHoldMs > 250 && dismissTutorial) dismissTutorial();
      } else {
        tutGasHoldMs = 0;
      }
    }
    let debugHeadX = 0, debugHeadY = 0, debugCrashActive = false, debugInvincible = false;
    let rearDown = false, frontDown = false;

    if (pendingRespawn) {
      if (timestamp < crashFreezeUntil) {
        while (accumulator >= PHYSICS_DT) {
          prevBikeState = saveBikeState();
          const wakeX = ragdoll ? ragdoll.torso.position.x : bike.frame.position.x;
          for (let i = 0; i < allTerrainBodies.length; i++) {
            const b = allTerrainBodies[i];
            if (b.isSleeping && Math.abs(b.position.x - wakeX) < 600) Matter.Sleeping.set(b, false);
          }
          Matter.Engine.update(engine, PHYSICS_DT);
          accumulator -= PHYSICS_DT;
        }
      } else {
        pendingRespawn = false;
        removeRagdoll();
        resetToCheckpoint();
      }
    }

    debugPhysicsSteps = 0;
    debugEngineMs = 0;
    let debugPdMode = 'AIR';
    while (accumulator >= PHYSICS_DT) {
      debugPhysicsSteps++;
      prevBikeState = saveBikeState();

      const bikeX = bike.frame.position.x;
      let nearbyCount = 0;
      for (let i = 0; i < allTerrainBodies.length; i++) {
        const b = allTerrainBodies[i];
        const bx = b.position.x;
        if (bx > bikeX - 200 && bx < bikeX + 200) nearbyTerrain[nearbyCount++] = b;
      }
      nearbyTerrain.length = nearbyCount;

      if (wantsGas) accelerate(bike, nearbyTerrain, terrainPoints, grounded);
      const airLeanBoost = grounded ? 1 : 1.15;
      if (wantsLeanBack) leanBack(bike, leanBackStrength * airLeanBoost);
      if (wantsLeanForward) {
        if (grounded && Math.abs(smoothTargetAngle) > 1.05) {
          Matter.Body.applyForce(bike.frontWheel, bike.frontWheel.position, {
            x: Math.cos(smoothTargetAngle) * 0.003 * leanForwardStrength,
            y: Math.sin(smoothTargetAngle) * 0.003 * leanForwardStrength,
          });
        } else {
          leanForward(bike, leanForwardStrength * airLeanBoost);
        }
      }
      if (wantsJump) {
        jump(bike, grounded);
        if (tutStep === 'jump' && grounded) tutStep = 'lean';
        keys['Space'] = false; touch.jump = false; wantsJump = false;
      }

      if (wantsNos && nosTimer > 0 && nosCooldownTimer <= 0) {
        if (!nosActive) { nosActive = true; if (gameTime - lastNosSound > 0.5) { playNos(); lastNosSound = gameTime; } }
        nosTimer -= STEP_S;
        const nosAngle = bike.frame.angle;
        Matter.Body.applyForce(bike.frame, bike.frame.position, { x: Math.cos(nosAngle) * NOS_FORCE, y: Math.sin(nosAngle) * NOS_FORCE });
        if (bike.rearWheel.angularVelocity < 1.0) {
          Matter.Body.setAngularVelocity(bike.rearWheel, bike.rearWheel.angularVelocity + 0.02);
        }
        if (nosTimer <= 0) {
          nosTimer = 0;
          nosActive = false;
          nosCooldownTimer = NOS_COOLDOWN;
        }
      } else if (nosActive) {
        nosActive = false;
      }
      if (!nosActive && nosCooldownTimer > 0) {
        nosCooldownTimer -= STEP_S;
        if (nosCooldownTimer <= 0) { nosCooldownTimer = 0; nosTimer = NOS_DURATION; }
      } else if (!nosActive && nosTimer < NOS_DURATION && nosCooldownTimer <= 0) {
        nosTimer = Math.min(NOS_DURATION, nosTimer + STEP_S * (NOS_DURATION / NOS_COOLDOWN));
      }

      let targetAngle = 0;
      {
        const contactAngle = grounded ? getContactAngle(bike, nearbyTerrain) : null;
        if (contactAngle !== null) {
          targetAngle = contactAngle;
          smoothTargetAngle += (targetAngle - smoothTargetAngle) * 0.3;
        }
        targetAngle = smoothTargetAngle;
        debugSlopeAngle = targetAngle * 180 / Math.PI;
      }
      const av = bike.frame.angularVelocity;
      const leanActive = wantsLeanBack || wantsLeanForward;
      const steepSlope = Math.abs(targetAngle) > 0.7;
      debugPdMode = 'AIR';
      if (fullyGrounded && !leanActive && !steepSlope) {
        const Kp = 0.18;
        const Kd = 0.10;
        const angleDiff = targetAngle - bike.frame.angle;
        const correction = angleDiff * Kp - av * Kd;
        Matter.Body.setAngularVelocity(bike.frame, av + correction);
        debugPdMode = 'FULL PD';
      } else if (grounded) {
        Matter.Body.setAngularVelocity(bike.frame, av * 0.98);
        debugPdMode = steepSlope ? 'STEEP' : 'ONE-WHEEL';
      } else {
        Matter.Body.setAngularVelocity(bike.frame, av * 0.96);
      }
      const maxAV = grounded ? 0.08 : 0.105;
      const clampedAV = bike.frame.angularVelocity;
      if (Math.abs(clampedAV) > maxAV) {
        Matter.Body.setAngularVelocity(bike.frame, Math.sign(clampedAV) * maxAV);
      }

      const engineStart = performance.now();
      Matter.Engine.update(engine, PHYSICS_DT);
      debugEngineMs += performance.now() - engineStart;

      const rearWX = bike.rearWheel.position.x;
      const frontWX = bike.frontWheel.position.x;
      for (let sp = 0; sp < sharpPeaks.length; sp++) {
        const peak = sharpPeaks[sp];
        if (peak.x <= rearWX || peak.x >= frontWX) continue;
        const t = (peak.x - rearWX) / (frontWX - rearWX);
        const guardY = bike.rearWheel.position.y + t * (bike.frontWheel.position.y - bike.rearWheel.position.y) - 15;
        if (peak.y < guardY) {
          const bounce = -3;
          for (const b of [bike.frame, bike.rearWheel, bike.frontWheel, bike.guard]) {
            Matter.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(b.velocity.y, bounce) });
          }
          break;
        }
      }

      rearDown = isRearGrounded(bike, nearbyTerrain);
      frontDown = isFrontGrounded(bike, nearbyTerrain);
      grounded = rearDown || frontDown;
      fullyGrounded = rearDown && frontDown;

      if (tutStep === 'lean' && !grounded && airTime > 0.2 && (wantsLeanBack || wantsLeanForward)) {
        tutStep = 'done';
        tutDoneAt = timestamp;
        localStorage.setItem('dalalrider_tutorial_done', '1');
      }

      if (coins.length) {
        while (coinCursor < coins.length && coins[coinCursor].x < bikeX - 200) coinCursor++;
        while (coinCursor > 0 && coins[coinCursor - 1].x >= bikeX - 200) coinCursor--;
        for (let ci = coinCursor; ci < coins.length && coins[ci].x < bikeX + 200; ci++) {
          const cn = coins[ci];
          if (cn.taken) continue;
          for (const b of [bike.frame, bike.rearWheel, bike.frontWheel]) {
            const dx = b.position.x - cn.x;
            const dy = b.position.y - cn.y;
            if (dx * dx + dy * dy < 32 * 32) {
              cn.taken = true;
              cn.takenAt = gameTime;
              coinsTaken++;
              score += COIN_VALUE;
              playCoin();
              break;
            }
          }
        }
      }

      if (targetAngle < -0.26) {
        const sinSlope = Math.sin(Math.abs(targetAngle));
        if (grounded) {
          const nudge = 0.04 * sinSlope;
          for (const body of [bike.frame, bike.rearWheel, bike.frontWheel]) {
            Matter.Body.setVelocity(body, { x: body.velocity.x + nudge, y: body.velocity.y });
          }
        } else {
          const airFade = Math.max(0, 1 - airTime * 0.5);
          const tilt = 0.00015 * sinSlope * airFade;
          for (const body of [bike.frame, bike.rearWheel, bike.frontWheel]) {
            Matter.Body.applyForce(body, body.position, { x: tilt * body.mass, y: 0 });
          }
        }
      }

      if (nosActive && !grounded) nosUsedInFlight = true;

      const crashRadius = 6;
      const cos = Math.cos(bike.frame.angle);
      const sin = Math.sin(bike.frame.angle);
      let headX = bike.frame.position.x + sin * 30;
      let headY = bike.frame.position.y - cos * 30;
      const headRegion = {
        min: { x: headX - crashRadius, y: headY - crashRadius },
        max: { x: headX + crashRadius, y: headY + crashRadius },
      };
      const nearby = Matter.Query.region(nearbyTerrain, headRegion);
      const riderCrash = nearby.length > 0 &&
        Matter.Query.point(nearby, { x: headX, y: headY }).length > 0;
      if (riderCrash && gameTime > invincibleUntil && !finished) {
        if (crashes === 0) timeToFirstCrash = gameTime;
        crashes++;
        gameEvents.push({ type: 'crash', progress: Math.min(1, Math.max(0, bike.frame.position.x / totalLength)) });
        score = Math.max(0, score - 500);
        if (streak > 1) streakJustLost = true;
        streak = 1;
        buzz(80);
        invincibleUntil = gameTime + 2;
        nosActive = false;
        playCrash();
        spawnParticles(26, headX, headY, { colors: ['#E24B4A', '#EF9F27', '#F4F4F6', '#8F8F9A'], speed: [80, 420], gravity: 900, life: [0.45, 0.95], size: [2, 5] });
        spawnRagdoll(headX, headY, bike.frame.velocity.x, bike.frame.velocity.y);
        addShake(12);
        crashFlash = 1;
        crashFreezeUntil = timestamp + 1000;
        pendingRespawn = true;
        accumulator = 0;
        break;
      }
      const cos2 = Math.cos(bike.frame.angle);
      const sin2 = Math.sin(bike.frame.angle);
      headX = bike.frame.position.x + sin2 * 30;
      headY = bike.frame.position.y - cos2 * 30;
      debugHeadX = headX;
      debugHeadY = headY;
      debugCrashActive = riderCrash;
      debugInvincible = gameTime < invincibleUntil;

      if (bike.frame.position.x < terrainPoints[0].x && gameTime > invincibleUntil && !finished) {
        if (crashes === 0) timeToFirstCrash = gameTime;
        crashes++;
        gameEvents.push({ type: 'crash', progress: 0 });
        score = Math.max(0, score - 500);
        if (streak > 1) streakJustLost = true;
        streak = 1;
        buzz(80);
        invincibleUntil = gameTime + 2;
        nosActive = false;
        playCrash();
        spawnParticles(26, headX, headY, { colors: ['#E24B4A', '#EF9F27', '#F4F4F6', '#8F8F9A'], speed: [80, 420], gravity: 900, life: [0.45, 0.95], size: [2, 5] });
        spawnRagdoll(headX, headY, bike.frame.velocity.x, bike.frame.velocity.y);
        addShake(12);
        crashFlash = 1;
        crashFreezeUntil = timestamp + 1000;
        pendingRespawn = true;
        accumulator = 0;
        break;
      }

      const terrainYAtHead = getTerrainY(terrainPoints, headX);
      const headToTerrain = terrainYAtHead - headY;
      if (headToTerrain >= 0 && headToTerrain < 10 && gameTime > invincibleUntil && !postCrashAirborne) {
        pennyPincherTime += STEP_S;
        if (pennyPincherTime >= 0.5) {
          const earned = 350 * streak;
          score += earned;
          floatingTexts.push({ x: bike.frame.position.x, y: bike.frame.position.y - 50, text: `Penny Pincher! +${earned}${streakTag()}`, color: '#2ECC71', fontSize: 16, elapsed: 0, duration: 2 });
          playTrick();
          buzz(20);
          countTrick('Penny Pincher');
          pennyPincherTime = 0;
        }
      } else {
        pennyPincherTime = 0;
      }

      if (!grounded) {
        if (!postCrashAirborne) {
          airTime += STEP_S;
          const angleDelta = bike.frame.angle - lastAngle;
          const normalizedDelta = ((angleDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
          totalRotation += normalizedDelta;
          peakAirRotation = Math.max(peakAirRotation, Math.abs(totalRotation));
          if (wantsGas && peakAirRotation < Math.PI / 3) {
            supermanTime += STEP_S;
            if (supermanTime >= 1.5) { supermanTriggered = true; supermanFade = 1; }
          } else {
            supermanTime = 0;
            if (supermanFade > 0) supermanFade = Math.max(0, supermanFade - STEP_S / 0.3);
          }
          if (!wantsGas && peakAirRotation < Math.PI / 3) {
            noHanderTime += STEP_S;
            if (noHanderTime >= 2.0) noHanderTriggered = true;
          } else {
            noHanderTime = 0;
          }
        }
      } else {
        if (postCrashAirborne) {
          postCrashAirborne = false;
        } else if (airTime > 0.3) {
          playLanding();
          if (airTime > 3.5) addShake(Math.min(6, airTime * 1.5));
          landingSquash = Math.min(1, 0.3 + airTime * 0.35);
          const fullRotations = Math.floor(Math.abs(totalRotation) / (Math.PI * 2));
          const bx = bike.frame.position.x;
          let ty = bike.frame.position.y - 50;
          const spawnText = (text: string, color: string, fontSize: number, dur = 2) => {
            floatingTexts.push({ x: bx, y: ty, text, color, fontSize, elapsed: 0, duration: dur });
            ty -= 25;
          };

          let landingHadTrick = false;

          if (fullRotations > 0) {
            const earned = fullRotations * 500 * streak;
            flipCount += fullRotations;
            score += earned;
            const isBack = totalRotation < 0;
            const base = isBack ? 'Backflip' : 'Frontflip';
            const prefix = fullRotations === 1 ? '' : fullRotations === 2 ? 'Double ' : fullRotations === 3 ? 'Triple ' : `${fullRotations}x `;
            spawnText(`${prefix}${base}! +${earned}${streakTag()}`, '#FFD700', 18);
            playTrick();
            countTrick('Flip');
            landingHadTrick = true;
          } else if (supermanTriggered) {
            const earned = 250 * streak;
            score += earned;
            spawnText(`Superman! +${earned}${streakTag()}`, '#00BFFF', 17);
            playTrick();
            countTrick('Superman');
            landingHadTrick = true;
          } else if (airTime > 3.5 && peakAirRotation < 0.3) {
            const earned = 150 * streak;
            score += earned;
            spawnText(`Dead Sailor! +${earned}${streakTag()}`, '#B0C4DE', 15);
            playTrick();
            countTrick('Dead Sailor');
            landingHadTrick = true;
          }

          if (noHanderTime >= 2.0) {
            const earned = 300 * streak;
            score += earned;
            spawnText(`No-Hander! +${earned}${streakTag()}`, '#87CEEB', 17);
            playTrick();
            countTrick('No-Hander');
            landingHadTrick = true;
          }

          if (fullRotations > 0 && airTime > 3) {
            score += 500;
            spawnText('ASTRONAUT! +500', '#9B59B6', 20, 2.5);
            playNamedCombo();
            countTrick('Astronaut');
          }
          if (fullRotations > 0 && hadRecentWheelie) {
            score += 500;
            spawnText('SHOWOFF! +500', '#F39C12', 20, 2.5);
            playNamedCombo();
            countTrick('Showoff');
          }
          if (fullRotations >= 2 && nosUsedInFlight) {
            score += 500;
            spawnText('MADMAN! +500', '#E74C3C', 20, 2.5);
            playNamedCombo();
            countTrick('Madman');
          }
          if (fullRotations > 0 && moonReachedThisFlight) {
            score += 500;
            spawnText('KISS THE MOON! +500', '#FFD700', 22, 2.5);
            playNamedCombo();
            countTrick('Kiss the Moon');
          }
          hadRecentWheelie = false;

          if (airTime > 0.6 && fullyGrounded) {
            const contactA = getContactAngle(bike, nearbyTerrain);
            if (contactA !== null) {
              let dA = bike.frame.angle - contactA;
              while (dA > Math.PI) dA -= Math.PI * 2;
              while (dA < -Math.PI) dA += Math.PI * 2;
              if (Math.abs(dA) < 0.18) {
                const earned = 150 * streak;
                score += earned;
                spawnText(`Perfect Landing! +${earned}${streakTag()}`, '#F4D35E', 15);
                playPerfectLanding();
                countTrick('Perfect Landing');
              }
            }
          }

          if (airTime > 5) {
            score += 400;
            spawnText('Massive Air! +400', '#FF4500', 15, 1.8);
          } else if (airTime > 3) {
            score += 200;
            spawnText('Big Air! +200', '#FFA500', 14, 1.8);
          }

          if (airTime > 1.5 && terrainPeaks.some(px => Math.abs(bx - px) < 50)) {
            const earned = 250 * streak;
            score += earned;
            spawnText(`Cliff Hanger! +${earned}${streakTag()}`, '#27AE60', 16);
            playCombo();
            countTrick('Cliff Hanger');
            landingHadTrick = true;
          }

          if (landingHadTrick) {
            streak = Math.min(5, streak + 1);
            maxStreak = Math.max(maxStreak, streak);
            buzz(25);
          }

        }
        airTime = 0;
        totalRotation = 0;
        peakAirRotation = 0;
        supermanTime = 0;
        supermanTriggered = false;
        supermanFade = 0;
        noHanderTime = 0;
        noHanderTriggered = false;
        nosUsedInFlight = false;
        moonReachedThisFlight = false;
      }
      lastAngle = bike.frame.angle;

      if (rearDown && !frontDown && Math.abs(bike.frame.velocity.x) > 0.5) {
        wheelieTime += STEP_S;
      } else {
        if (wheelieTime > 2.5) {
          const earned = 300 * streak;
          score += earned;
          floatingTexts.push({ x: bike.frame.position.x, y: bike.frame.position.y - 50, text: `Wheelie! +${earned}${streakTag()}`, color: '#FF6B35', fontSize: 16, elapsed: 0, duration: 2 });
          playCombo();
          buzz(20);
          countTrick('Wheelie');
          hadRecentWheelie = true;
        }
        wheelieTime = 0;
      }
      if (frontDown && !rearDown) {
        stoppieTime += STEP_S;
      } else {
        if (stoppieTime > 2.0) {
          const earned = 400 * streak;
          score += earned;
          floatingTexts.push({ x: bike.frame.position.x, y: bike.frame.position.y - 50, text: `Stoppie! +${earned}${streakTag()}`, color: '#FF4500', fontSize: 16, elapsed: 0, duration: 2 });
          playCombo();
          buzz(20);
          countTrick('Stoppie');
        }
        stoppieTime = 0;
      }

      if (bike.frame.velocity.x > 12) {
        speedDemonTime += STEP_S;
        if (speedDemonTime >= 5) {
          const earned = 200 * streak;
          score += earned;
          floatingTexts.push({ x: bike.frame.position.x, y: bike.frame.position.y - 50, text: `Speed Demon! +${earned}${streakTag()}`, color: '#FF6347', fontSize: 16, elapsed: 0, duration: 2 });
          playCombo();
          buzz(20);
          countTrick('Speed Demon');
          speedDemonTime = 0;
        }
      } else {
        speedDemonTime = 0;
      }

      if (!grounded && !moonReached && bike.frame.position.y < MOON_Y + 200) {
        moonReached = true;
        gameEvents.push({ type: 'moon', progress: Math.min(1, Math.max(0, bike.frame.position.x / totalLength)) });
        moonReachedThisFlight = true;
        score += 1000;
        floatingTexts.push({ x: bike.frame.position.x, y: bike.frame.position.y - 60, text: 'TO THE MOON! +1000', color: '#FFD700', fontSize: 22, elapsed: 0, duration: 2.5 });
        playMoonReached();
        buzz(40);
      }

      const progress = Math.min(1, bike.frame.position.x / totalLength);
      score = Math.max(score, Math.floor(progress * 1000));

      if (!finished && !tutorialActive) {
        if (!bellPlayed) { bellPlayed = true; playOpeningBell(); }
        gameTime += STEP_S;
        currentGhost.push({ t: gameTime, x: bike.frame.position.x, y: bike.frame.position.y, a: bike.frame.angle });
      }

      if (bike.frame.position.x >= endPoleX && !finished) {
        finished = true;
        score += 1000;
        if (options.multiplayer) mp.reportMyFinish(gameTime, score);
        playFinish();
        buzz([30, 40, 90]);
        addShake(5);
        finishTimer = setTimeout(() => {
          finishTimer = null;
          running = false;
          cleanup();
          callbacks.onFinish({ score, flips: flipCount, crashes, maxStreak, finished: true, time: gameTime, timeToFirstCrash, tricks: { ...trickCounts }, events: [...gameEvents], coins: coinsTaken, coinsTotal: coins.length });
        }, 3500);
      }

      const wakeThreshold = bikeX + 600;
      const sleepThreshold = bikeX - 800;
      for (let i = 0; i < allTerrainBodies.length; i++) {
        const b = allTerrainBodies[i];
        const bx = b.position.x;
        if (b.isSleeping && bx > sleepThreshold && bx < wakeThreshold) {
          Matter.Sleeping.set(b, false);
        } else if (!b.isSleeping && (bx < sleepThreshold || bx > wakeThreshold)) {
          Matter.Sleeping.set(b, true);
        }
      }

      accumulator -= PHYSICS_DT;
    }
    debugPhysicsMs = performance.now() - perfStart;
    frameCount++;
    if (options.multiplayer && mp.state && frameCount % 3 === 0 && !finished) {
      const prog = Math.min(1, Math.max(0, (bike.frame.position.x - SPAWN_X) / (endPoleX - SPAWN_X)));
      mp.broadcastMyPosition(bike.frame.position.x, bike.frame.position.y, bike.frame.angle, prog, score, crashes);
    }

    const renderStart = performance.now();
    const alpha = accumulator / PHYSICS_DT;
    const physBikeState = saveBikeState();
    lerpBikeForRender(prevBikeState, alpha);

    const camBody = pendingRespawn && ragdoll ? ragdoll.torso : bike.frame;
    camera.update(camBody.position.x, camBody.position.y, camBody.velocity.x, pendingRespawn ? false : grounded, airTime);

    {
      const speed = Math.min(1, Math.abs(bike.frame.velocity.x) / 15);
      const airFade = grounded ? 1 : Math.max(0.3, 1 - airTime / 5);
      updateEngine(speed * airFade);
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const renderDt = Math.min(0.05, frameDt / 1000);
    if (!bgGradient || bgGradientH !== vh) {
      bgGradient = ctx.createLinearGradient(0, 0, 0, vh);
      bgGradient.addColorStop(0, '#050914');
      bgGradient.addColorStop(0.55, '#091022');
      bgGradient.addColorStop(1, '#0D152C');
      bgGradientH = vh;
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, vw, vh);
    drawParallax(ctx, camera.x, camera.y, vw, vh);
    ctx.save();
    if (camera.zoom !== 1) {
      ctx.translate(vw / 2, vh / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-vw / 2, -vh / 2);
    }
    if (shakeMag > 0.1) {
      ctx.translate((Math.random() * 2 - 1) * shakeMag, (Math.random() * 2 - 1) * shakeMag);
      shakeMag *= Math.pow(0.002, renderDt);
    } else if (shakeMag !== 0) {
      shakeMag = 0;
    }
    drawGrid(ctx, camera.x, camera.y, vw, vh);
    drawTerrain(ctx, terrainPoints, camera.x, camera.y, vw, vh, showTrendColors ? trendZones : undefined, isTrustMrr ? '#5066FB' : undefined);
    if (showPriceMarkers) drawPriceMarkers(ctx, priceMarkers, camera.x, camera.y, vw, vh);
    if (showMarketEvents) drawMarketEvents(ctx, marketEvents, camera.x, camera.y, vw, vh, isTrustMrr ? '#5066FB' : undefined);
    drawCoins(ctx, camera.x, camera.y, vw, vh);
    drawPole(ctx, startPoleX, startPoleY, 'START', isTrustMrr ? '#5066FB' : '#00E676', false, camera.x, camera.y, vw, vh);
    drawPole(ctx, endPoleX, endPoleY, 'FINISH', '#EF9F27', true, camera.x, camera.y, vw, vh);
    if (options.tombstone) {
      const tsX = endPoleX + 200;
      drawTombstone(ctx, tsX, getTerrainY(terrainPoints, tsX), options.tombstone.label, options.tombstone.years, camera.x, camera.y, vw, vh);
    }
    if (activeGhost && activeGhost.length > 0 && gameTime > 0 && gameTime <= activeGhost[activeGhost.length - 1].t) {
      let lo = 0, hi = activeGhost.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; activeGhost[mid].t < gameTime ? lo = mid + 1 : hi = mid; }
      const i = Math.max(0, Math.min(lo, activeGhost.length - 1));
      const g = activeGhost[i];
      if (i > 0) {
        const prev = activeGhost[i - 1];
        const frac = Math.max(0, Math.min(1, (gameTime - prev.t) / (g.t - prev.t || 1)));
        const gx = prev.x + (g.x - prev.x) * frac;
        const gy = prev.y + (g.y - prev.y) * frac;
        const ga = prev.a + (g.a - prev.a) * frac;
        drawGhostBike(ctx, gx, gy, ga, camera.x, camera.y, vw, vh);
      } else {
        drawGhostBike(ctx, g.x, g.y, g.a, camera.x, camera.y, vw, vh);
      }
    }
    if (options.multiplayer && mp.state) {
      for (const p of Object.values(mp.state.players)) {
        if (p.id === mp.myId) continue;
        drawOpponentBike(ctx, p.x, p.y, p.angle, p.nickname, p.color, camera.x, camera.y, vw, vh);
      }
    }
    const nhBlend = noHanderTriggered ? Math.min(1, (noHanderTime - 2.0) / 0.2) : 0;
    const smBlend = (!grounded && !postCrashAirborne && supermanTriggered) ? (supermanTime > 1.5 ? Math.min(1, (supermanTime - 1.5) / 0.3) : supermanFade) : 0;
    if (landingSquash > 0.01) landingSquash *= Math.pow(0.0004, renderDt);
    else landingSquash = 0;
    drawBike(ctx, bike, camera.x, camera.y, vw, vh, { noHanderBlend: nhBlend, supermanBlend: smBlend, founderFace, faceRadius: faceIsLogo ? 15 : 12, hideRider: !!ragdoll, squash: landingSquash });
    if (ragdoll) drawRagdoll(ctx, ragdoll, camera.x, camera.y, vw, vh, founderFace);
    if (nosActive) drawNosFlame(ctx, bike, camera.x, camera.y, vw, vh, gameTime);

    if (!reducedMotion && !pendingRespawn) {
      const velX = bike.frame.velocity.x;
      if (grounded && Math.abs(velX) > 4 && Math.random() < Math.abs(velX) / 16) {
        spawnParticles(1, bike.rearWheel.position.x - 4, bike.rearWheel.position.y + 11, {
          colors: ['#3E3E48', '#4A4A55', '#585864'],
          speed: [15, 60], angle: [-Math.PI * 0.95, -Math.PI * 0.55],
          vx0: -velX * 14, vy0: -15, gravity: -50, life: [0.3, 0.6], size: [2, 4.5],
        });
      }
      if (nosActive) {
        const na = bike.frame.angle + Math.PI;
        spawnParticles(2, bike.rearWheel.position.x + Math.cos(na) * 16, bike.rearWheel.position.y + Math.sin(na) * 16 - 4, {
          colors: ['#FFAA00', '#FF6600', '#FF3300'],
          speed: [60, 180], angle: [na - 0.4, na + 0.4], gravity: -20, life: [0.2, 0.45], size: [1.5, 3.5],
        });
      }
    }
    updateAndDrawParticles(ctx, renderDt, camera.x, camera.y, vw, vh);

    debugRenderMs = performance.now() - renderStart;

    drawFloatingTexts(ctx, floatingTexts, renderDt, camera.x, camera.y, vw, vh);

    ctx.restore();

    if (crashFlash > 0.02) {
      ctx.fillStyle = `rgba(226, 75, 74, ${(crashFlash * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);
      crashFlash *= Math.pow(0.008, renderDt);
    } else if (crashFlash !== 0) {
      crashFlash = 0;
    }

    drawMinimap(ctx, terrainPoints, bike.frame.position.x, bike.frame.position.y, vw, vh, options.multiplayer);
    if (options.multiplayer && mp.state) {
      const mpBoard = document.getElementById('mp-hud-board');
      if (mpBoard) {
        mpBoard.style.display = 'block';
        const sorted = Object.values(mp.state.players).sort((a, b) => {
          if (a.finished && b.finished) return a.finishTime - b.finishTime;
          if (a.finished) return -1;
          if (b.finished) return 1;
          return b.progress - a.progress;
        });
        mpBoard.innerHTML = `<div style="color:#FF9933;font-weight:800;margin-bottom:5px;letter-spacing:0.8px">🏁 ROOM ${mp.state.code}</div>` +
          sorted.map((p, idx) => {
            const status = p.finished ? `🏆 ${p.finishTime.toFixed(1)}s` : `${Math.round(p.progress * 100)}%`;
            return `<div style="display:flex;justify-content:space-between;gap:10px;padding:2px 0;color:${p.id === mp.myId ? '#fff' : '#aaa'};font-weight:${p.id === mp.myId ? '700' : '400'}">
              <span>${idx + 1}. <span style="color:${p.color}">●</span> ${p.nickname.slice(0, 11)}</span>
              <span style="color:${p.finished ? '#00E676' : '#888'}">${status}</span>
            </div>`;
          }).join('');
      }
      const winToast = document.getElementById('mp-winner-toast');
      if (winToast && mp.state.winnerId) {
        winToast.style.display = 'block';
        const iWon = mp.state.winnerId === mp.myId;
        winToast.style.borderColor = iWon ? '#00E676' : '#FF9933';
        winToast.innerHTML = `<div style="font-size:11px;color:${iWon ? '#00E676' : '#FF9933'};font-weight:800;letter-spacing:1.5px">${iWon ? '👑 YOU WON THE RACE!' : '🏁 WINNER CROSSED THE LINE!'}</div>
          <div style="font-size:18px;font-weight:800;color:#fff;margin-top:2px">${mp.state.winnerName} · ${(mp.state.winnerTime || 0).toFixed(1)}s</div>`;
      }
      if (mpCountdownLeft > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(10, 12, 16, 0.55)';
        ctx.fillRect(0, 0, vw, vh);
        ctx.font = '900 72px "JetBrains Mono", monospace';
        ctx.fillStyle = '#FF9933';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const num = Math.ceil(mpCountdownLeft);
        ctx.fillText(num > 0 ? String(num) : 'GO!', vw / 2, vh / 2 - 20);
        ctx.font = '700 15px "JetBrains Mono", monospace';
        ctx.fillStyle = '#F4F4F6';
        ctx.fillText('FIRST TO CROSS THE FINISH LINE WINS!', vw / 2, vh / 2 + 42);
        ctx.restore();
      }
    }

    const moonScreenY = (MOON_Y - camera.y) + vh / 2;
    if (moonScreenY > -80 && moonScreenY < vh + 80) {
      drawMoon(ctx, vw * 0.75, moonScreenY);
    }

    if (!isTouchDevice) drawNosHud(ctx, vw, vh, nosActive, nosTimer, nosCooldownTimer, NOS_DURATION, NOS_COOLDOWN);

    if (nosBtn) {
      const hasNos = nosTimer > 0 && nosCooldownTimer <= 0;
      const cls = `mobile-only ${hasNos ? 'nos-ready' : 'nos-cooldown'}`;
      if (nosBtn.className !== cls) nosBtn.className = cls;
      const fill = Math.round((nosCooldownTimer > 0 ? 1 - nosCooldownTimer / NOS_COOLDOWN : nosTimer / NOS_DURATION) * 100);
      if (fill !== lastNosFill) {
        lastNosFill = fill;
        nosBtn.style.setProperty('--nos-fill', `${fill}%`);
        nosBtn.style.setProperty('--nos-color', `rgb(${Math.round(220 - fill * 1.8)}, ${Math.round(50 + fill * 1.7)}, 40)`);
      }
      if (nosCd) {
        const cdStr = nosCooldownTimer > 0 ? String(Math.ceil(nosCooldownTimer)) : '';
        if (nosCd.textContent !== cdStr) nosCd.textContent = cdStr;
      }
    }

    if (isTouchDevice) {
      const diveInput = touch.leanForward || nosLeanDir === -1;
      const wheelieInput = touch.leanBack || nosLeanDir === 1;
      tcDiveHeldSince = diveInput ? (tcDiveHeldSince || timestamp) : 0;
      tcWheelieHeldSince = wheelieInput ? (tcWheelieHeldSince || timestamp) : 0;
      tcDive?.classList.toggle('active', tcDiveHeldSince !== 0 && timestamp - tcDiveHeldSince > 200);
      tcWheelie?.classList.toggle('active', tcWheelieHeldSince !== 0 && timestamp - tcWheelieHeldSince > 200);
    }

    {
      const scoreStr = String(score);
      if (hudScore.textContent !== scoreStr) hudScore.textContent = scoreStr;
      if (hudAir) {
        const airStr = grounded ? 'grounded' : `${airTime.toFixed(1)}s`;
        if (hudAir.textContent !== airStr) hudAir.textContent = airStr;
        const airColor = grounded ? '#00E676' : '#EF9F27';
        if (hudAir.style.color !== airColor) hudAir.style.color = airColor;
      }
      const timerStr = formatTime(gameTime);
      if (hudTimer.textContent !== timerStr) hudTimer.textContent = timerStr;

      if (hudCoins && hudCoinsCount && coins.length) {
        const coinStr = `${coinsTaken}/${coins.length}`;
        if (hudCoinsCount.textContent !== coinStr) {
          hudCoinsCount.textContent = coinStr;
          hudCoins.style.display = 'inline-flex';
        }
      }

      if (streakJustLost) {
        streakJustLost = false;
        hudStreak.textContent = `×${displayedStreak}`;
        hudStreak.classList.remove('streak-pop', 'visible');
        hudStreak.classList.add('streak-lost');
        playStreakLost();
        displayedStreak = 1;
      } else if (streak !== displayedStreak) {
        const grew = streak > displayedStreak;
        displayedStreak = streak;
        hudStreak.textContent = `×${streak}`;
        hudStreak.dataset.level = String(streak);
        hudStreak.classList.toggle('visible', streak > 1);
        if (grew && streak > 1) {
          hudStreak.classList.remove('streak-pop');
          void hudStreak.offsetWidth;
          hudStreak.classList.add('streak-pop');
          playStreakUp(streak);
        }
      }
    }

    if (tutBanner && tutStep) {
      if (tutStep === 'done' && timestamp - tutDoneAt > 1600) {
        tutStep = null;
        tutBanner.style.display = 'none';
      } else {
        const text = tutorialActive ? ''
          : tutStep === 'jump' ? 'TAP THE SCREEN = JUMP'
          : tutStep === 'lean' ? 'LEFT SIDE = TILT — TRY IT IN THE AIR'
          : "✓ YOU'RE READY!";
        if (text !== lastTutText) {
          lastTutText = text;
          tutBanner.textContent = text;
          tutBanner.style.display = text ? 'block' : 'none';
          tutBanner.classList.toggle('tut-done', tutStep === 'done');
        }
      }
    }

    if (!finished && !pendingRespawn) {
      if (isTrustMrr) {
        const bikeX = bike.frame.position.x;
        const idx = Math.min(dataPoints.length - 1, Math.max(0, Math.floor((bikeX - 400) / 100)));
        displayedPrice = cumulativeRevenue[idx];
      } else {
        const groundY = Math.max(bike.rearWheel.position.y, bike.frontWheel.position.y) + 14;
        displayedPrice = yToPrice(groundY, priceMapping);
        if (displayedPrice < 0) displayedPrice = 0;
      }
    }
    const priceDiff = displayedPrice - referencePrice;
    const priceUp = priceDiff >= 0;
    const fmtPrice = displayedPrice >= 1_000_000
      ? `₹${(displayedPrice / 1_000_000).toFixed(2)}M`
      : displayedPrice >= 1000
        ? `₹${(displayedPrice / 1000).toFixed(2)}k`
        : displayedPrice >= 1
          ? `₹${displayedPrice.toFixed(2)}`
          : `₹${displayedPrice.toFixed(4)}`;
    let priceStr: string;
    if (isTrustMrr) {
      priceStr = fmtPrice;
    } else {
      const pctChange = referencePrice !== 0 ? ((priceDiff / referencePrice) * 100) : 0;
      const sign = priceUp ? '+' : '';
      priceStr = `${fmtPrice} (${sign}${pctChange.toFixed(1)}%)`;
    }
    if (hudPrice.textContent !== priceStr) hudPrice.textContent = priceStr;
    const priceColor = isTrustMrr ? '#00E676' : (priceUp ? '#00E676' : '#EF4444');
    if (hudPrice.style.color !== priceColor) hudPrice.style.color = priceColor;

    restoreBikeState(physBikeState);

    requestAnimationFrame(gameLoop);
  }

  let cleaned = false;
  let statsReported = false;
  function reportStats() {
    if (statsReported) return;
    statsReported = true;
    const priceRange = dataPoints.length >= 2
      ? Math.abs(dataPoints[dataPoints.length - 1].close - dataPoints[0].close)
      : 0;
    incrementStats(priceRange, crashes, isTrustMrr ? 'startups' : 'stocks').catch(() => {});
  }
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (finished && currentGhost.length > 0) {
      ghostReplay = currentGhost;
      ghostTrackKey = trackKey;
      callbacks.onGhostReady?.(currentGhost);
    }
    reportStats();
    if (finishTimer !== null) { clearTimeout(finishTimer); finishTimer = null; }
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('touchcancel', onTouchEnd);
    document.removeEventListener('fullscreenchange', onFullscreenExit);
    if (dismissTutorial) window.removeEventListener('keydown', dismissTutorial);
    running = false;
    stopEngine();
    Matter.Engine.clear(engine);
  }

  for (let i = 0; i < 6; i++) Matter.Engine.update(engine, PHYSICS_DT);
  resetBike(bike, SPAWN_X, spawnY);
  stabilizeBike(bike);

  startEngine();
  requestAnimationFrame(gameLoop);

  return { stop: () => { stopEngine(); cleanup(); } };
}

function drawGrid(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number) {
  ctx.save();
  ctx.translate(-camX + w / 2, -camY + h / 2);
  const gridSize = 200;
  const startX = Math.floor((camX - w / 2) / gridSize) * gridSize;
  const endX = camX + w / 2;
  const startY = Math.floor((camY - h / 2) / gridSize) * gridSize;
  const endY = camY + h / 2;
  ctx.strokeStyle = 'rgba(255, 140, 26, 0.07)';
  ctx.lineWidth = 0.5;
  for (let x = startX; x < endX; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
  for (let y = startY; y < endY; y += gridSize) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }
  ctx.restore();
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  terrainPoints: TerrainPoint[],
  bikeX: number,
  bikeY: number,
  canvasWidth: number,
  canvasHeight: number,
  isMultiplayer?: boolean
) {
  const isMobile = canvasWidth < 800;
  const MAP_W = isMobile ? Math.round(canvasWidth * 0.16) : 140;
  const MAP_H = isMobile ? Math.round(MAP_W * 0.45) : 60;
  const MARGIN = isMobile ? 6 : 12;
  const PADDING = 4;
  const mx = canvasWidth - MAP_W - MARGIN;
  const my = MARGIN;

  const firstX = terrainPoints[0].x;
  const lastX = terrainPoints[terrainPoints.length - 1].x;
  let minY = Infinity, maxY = -Infinity;
  for (const p of terrainPoints) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const rangeX = lastX - firstX || 1;
  const rangeY = maxY - minY || 1;

  const toMX = (wx: number) => mx + PADDING + ((wx - firstX) / rangeX) * (MAP_W - PADDING * 2);
  const toMY = (wy: number) => my + PADDING + ((wy - minY) / rangeY) * (MAP_H - PADDING * 2);

  ctx.save();

  ctx.fillStyle = 'rgba(12, 12, 18, 0.75)';
  ctx.strokeStyle = 'rgba(60, 60, 80, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(mx, my, MAP_W, MAP_H, 6);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(mx, my, MAP_W, MAP_H, 6);
  ctx.clip();

  ctx.beginPath();
  for (let i = 0; i < terrainPoints.length; i++) {
    const px = toMX(terrainPoints[i].x);
    const py = toMY(terrainPoints[i].y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#2a2a30';
  ctx.lineWidth = 1;
  ctx.stroke();

  const lastPx = toMX(terrainPoints[terrainPoints.length - 1].x);
  const firstPx = toMX(terrainPoints[0].x);
  ctx.lineTo(lastPx, my + MAP_H);
  ctx.lineTo(firstPx, my + MAP_H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(26, 26, 32, 0.8)';
  ctx.fill();

  if (isMultiplayer && mp.state) {
    for (const p of Object.values(mp.state.players)) {
      if (p.id === mp.myId) continue;
      const ox = toMX(p.x);
      const oy = toMY(p.y);
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  }
  const dotX = toMX(bikeX);
  const dotY = toMY(bikeY);
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#EF9F27';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(239, 159, 39, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

function drawFloatingTexts(
  ctx: CanvasRenderingContext2D,
  texts: FloatingText[],
  dt: number,
  camX: number,
  camY: number,
  canvasW: number,
  canvasH: number
) {
  ctx.save();
  ctx.translate(-camX + canvasW / 2, -camY + canvasH / 2);

  for (let i = texts.length - 1; i >= 0; i--) {
    const ft = texts[i];
    ft.elapsed += dt;
    if (ft.elapsed >= ft.duration) {
      texts.splice(i, 1);
      continue;
    }

    const progress = ft.elapsed / ft.duration;
    const easeOut = -progress * (progress - 2);
    const y = ft.y - 80 * easeOut;

    let alpha = 1;
    if (progress > 0.6) {
      alpha = 1 - (progress - 0.6) / 0.4;
    }

    const scale = 1.15 - 0.35 * progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(ft.fontSize * scale)}px sans-serif`;
    ctx.fillStyle = ft.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillText(ft.text, ft.x, y);
    ctx.restore();
  }

  ctx.restore();
}

function drawPriceMarkers(
  ctx: CanvasRenderingContext2D,
  markers: { x: number; y: number; price: string; date: string }[],
  camX: number,
  camY: number,
  canvasW: number,
  canvasH: number
) {
  const viewLeft = camX - canvasW;
  const viewRight = camX + canvasW;

  ctx.save();
  ctx.translate(-camX + canvasW / 2, -camY + canvasH / 2);

  for (const m of markers) {
    if (m.x < viewLeft || m.x > viewRight) continue;

    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x, m.y - 35);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(m.price, m.x, m.y - 38);

    ctx.font = '8px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textBaseline = 'top';
    ctx.fillText(m.date, m.x, m.y + 14);
  }

  ctx.restore();
}

function drawMarketEvents(
  ctx: CanvasRenderingContext2D,
  events: { x: number; y: number; text: string; isCrash: boolean }[],
  camX: number,
  camY: number,
  canvasW: number,
  canvasH: number,
  colorOverride?: string
) {
  const viewLeft = camX - canvasW;
  const viewRight = camX + canvasW;

  ctx.save();
  ctx.translate(-camX + canvasW / 2, -camY + canvasH / 2);

  for (const ev of events) {
    if (ev.x < viewLeft || ev.x > viewRight) continue;

    const color = colorOverride || (ev.isCrash ? '#E24B4A' : '#00E676');
    const large = !!colorOverride;
    const fontSize = large ? 13 : 10;
    const padX = large ? 18 : 14;
    const bh = large ? 26 : 20;
    const poleOffset = large ? 70 : 55;
    const radius = large ? 6 : 4;
    const flagY = ev.y - poleOffset;

    ctx.beginPath();
    ctx.moveTo(ev.x, ev.y);
    ctx.lineTo(ev.x, flagY + 14);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.font = `bold ${fontSize}px sans-serif`;
    const tw = ctx.measureText(ev.text).width + padX;
    const bx = ev.x - tw / 2;
    const by = flagY;

    ctx.fillStyle = colorOverride ? '#0e1230' : (ev.isCrash ? '#2a1010' : '#0a2a1a');
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, bh, radius);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, bh, radius);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ev.text, ev.x, by + bh / 2);
  }

  ctx.restore();
}

function getTerrainY(points: TerrainPoint[], x: number): number {
  let lo = 0, hi = points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    points[mid + 1].x < x ? lo = mid + 1 : hi = mid;
  }
  if (lo >= points.length - 1) return points[points.length - 1].y;
  const t = (x - points[lo].x) / (points[lo + 1].x - points[lo].x);
  return points[lo].y + t * (points[lo + 1].y - points[lo].y);
}

function drawPole(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  terrainY: number,
  label: string,
  color: string,
  checkered: boolean,
  camX: number,
  camY: number,
  canvasW: number,
  canvasH: number
) {
  if (worldX < camX - canvasW - 200 || worldX > camX + canvasW + 200) return;

  ctx.save();
  ctx.translate(-camX + canvasW / 2, -camY + canvasH / 2);

  const poleH = 120;
  const top = terrainY - poleH;

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(worldX, terrainY);
  ctx.lineTo(worldX, top);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(worldX, top - 3, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  const bw = 52;
  const bh = 20;
  const bx = worldX + 1;
  const by = top;

  if (checkered) {
    const sq = 5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    for (let r = 0; r < Math.ceil(bh / sq); r++) {
      for (let c = 0; c < Math.ceil(bw / sq); c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#fff' : '#111';
        ctx.fillRect(bx + c * sq, by + r * sq, sq, sq);
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 3);
    ctx.fill();
    ctx.fillStyle = '#04342C';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, by + bh / 2);
  }

  ctx.restore();
}

function drawTombstone(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  terrainY: number,
  label: string,
  years: string,
  camX: number,
  camY: number,
  canvasW: number,
  canvasH: number
) {
  if (worldX < camX - canvasW - 200 || worldX > camX + canvasW + 200) return;

  ctx.save();
  ctx.translate(-camX + canvasW / 2, -camY + canvasH / 2);

  const w = 48;
  const h = 60;
  const r = 14;
  const x = worldX - w / 2;
  const y = terrainY - h;

  ctx.beginPath();
  ctx.moveTo(x, terrainY);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, terrainY);
  ctx.closePath();

  ctx.fillStyle = '#3a3a42';
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.stroke();

  const cx = worldX;
  const crossY = y + 18;
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, crossY - 7);
  ctx.lineTo(cx, crossY + 7);
  ctx.moveTo(cx - 5, crossY - 2);
  ctx.lineTo(cx + 5, crossY - 2);
  ctx.stroke();

  ctx.fillStyle = '#999';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y + 34);

  ctx.font = '7px sans-serif';
  ctx.fillStyle = '#666';
  ctx.fillText(years, cx, y + 45);

  ctx.restore();
}

function drawNosFlame(
  ctx: CanvasRenderingContext2D,
  bike: { frame: Matter.Body; rearWheel: Matter.Body },
  camX: number, camY: number, vw: number, vh: number,
  t: number
) {
  ctx.save();
  ctx.translate(-camX + vw / 2, -camY + vh / 2);
  const rw = bike.rearWheel;
  const angle = bike.frame.angle;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const colors = ['#FFAA00', '#FF6600', '#FF3300', '#FF0000', '#CC0000'];
  for (let i = 0; i < 5; i++) {
    const dist = 14 + i * 7 + Math.sin(t * 40 + i * 2) * 4;
    const spread = Math.sin(t * 25 + i * 3) * 3;
    const fx = rw.position.x - cosA * dist + sinA * spread;
    const fy = rw.position.y - sinA * dist - cosA * spread;
    const size = 5 - i * 0.7;
    ctx.globalAlpha = 0.8 - i * 0.14;
    ctx.beginPath();
    ctx.arc(fx, fy, size, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 35, x, y, 120);
  grad.addColorStop(0, 'rgba(255, 250, 200, 0.15)');
  grad.addColorStop(1, 'rgba(255, 250, 200, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F5F0D0';
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200, 190, 150, 0.4)';
  for (const [dx, dy, r] of [[-12, -8, 7], [15, 10, 5], [4, -16, 4.5], [-6, 14, 3.5], [10, -5, 3]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawNosHud(
  ctx: CanvasRenderingContext2D,
  vw: number, vh: number,
  active: boolean, timer: number, cooldown: number,
  duration: number, cooldownMax: number
) {
  const isMobile = vw < 800;
  const barW = isMobile ? 70 : 90;
  const barH = isMobile ? 8 : 14;
  let x: number, y: number, labelCx: number;
  if (isMobile) {
    const mapW = Math.round(vw * 0.16);
    const mapH = Math.round(mapW * 0.45);
    const mapX = vw - mapW - 6;
    x = mapX + (mapW - barW) / 2;
    y = 6 + mapH + 8;
    labelCx = mapX + mapW / 2;
  } else {
    x = vw / 2 - barW / 2;
    y = 62;
    labelCx = vw / 2;
  }

  let fill: number;
  if (active) {
    fill = timer / duration;
  } else if (cooldown > 0) {
    fill = 1 - cooldown / cooldownMax;
  } else {
    fill = timer / duration;
  }

  const r = Math.round(220 - fill * 180);
  const g = Math.round(50 + fill * 170);
  const barColor = cooldown > 0 ? '#444' : `rgb(${r},${g},40)`;

  ctx.save();
  ctx.fillStyle = 'rgba(20, 20, 28, 0.6)';
  ctx.beginPath();
  ctx.roundRect(x, y, barW, barH, 3);
  ctx.fill();
  ctx.fillStyle = barColor;
  ctx.beginPath();
  ctx.roundRect(x, y, barW * fill, barH, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(x, y, barW, barH, 3);
  ctx.stroke();
  ctx.font = `bold ${isMobile ? 7 : 9}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cooldown > 0 ? '#666' : 'rgba(255,255,255,0.85)';
  ctx.fillText(cooldown > 0 ? `NITRO ${Math.ceil(cooldown)}s` : 'NITRO', labelCx, y + barH / 2 + (isMobile ? 1 : 0.5));
  ctx.restore();
}
