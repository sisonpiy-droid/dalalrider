import { TickerInfo, DataPoint, filterByPeriod, calcPerformance, calcDifficulty, verifyChallenge, IpoConfig, fetchIpoTicker, ipoResponseToTickerInfo, fetchTrackLeaderboard, TrackLeaderboard, isIpoTicker, PROXY_URL, trackBestId, getTrackBest } from '../data/TickerData';
import { medalFor } from './ShareCardVariants';
import { preloadBell } from '../sound';
import { footerHTML } from '../ui/Footer';
import { navHTML } from '../ui/Nav';
import { checkerFlagSVG } from '../ui/TrackStrip';

const BASE_PERIODS = ['1d', '1m', '3m', '6m', '1y', 'all'];
const MIN_DATA_POINTS = 20;

const PERIOD_EXPECTED_DAYS: Record<string, number> = {
  '1m': 25, '3m': 90, '6m': 180, '1y': 365,
};

function periodAvailable(allPoints: DataPoint[], period: string, ticker?: TickerInfo): boolean {
  const pts = filterByPeriod(allPoints, period, ticker);
  if (pts.length < MIN_DATA_POINTS) return false;
  if (period === 'all' || period === 'crash' || period === '1d') return true;
  const expected = PERIOD_EXPECTED_DAYS[period];
  if (!expected) return true;
  const spanMs = new Date(pts[pts.length - 1].date).getTime() - new Date(pts[0].date).getTime();
  return spanMs >= expected * 0.8 * 86_400_000;
}

const DIFFICULTY_COLORS: Record<string, { text: string; bg: string }> = {
  easy: { text: '#5DCAA5', bg: '#0F3D2E' },
  medium: { text: '#EF9F27', bg: '#3D2E0A' },
  hard: { text: '#EF9F27', bg: '#3D2E0A' },
  insane: { text: '#E24B4A', bg: '#3D1616' },
};

function chartSVG(points: DataPoint[], smooth = false, colorOverride?: string): string {
  if (points.length < 2) return '';
  const min = Math.min(...points.map(p => p.close));
  const max = Math.max(...points.map(p => p.close));
  const range = max - min || 1;
  const w = 660;
  const h = 200;
  const pad = 10;
  const step = (w - pad * 2) / (points.length - 1);

  const color = colorOverride || (points[points.length - 1].close >= points[0].close ? '#5DCAA5' : '#E24B4A');

  const rawCoords = points.map((p, i) => ({
    x: pad + i * step,
    y: h - pad - ((p.close - min) / range) * (h - pad * 3),
  }));

  let plotCoords = rawCoords;
  if (smooth && rawCoords.length > 4) {
    const SAMPLE = Math.max(1, Math.floor(rawCoords.length / 40));
    const sampled = rawCoords.filter((_, i) => i % SAMPLE === 0);
    if (sampled[sampled.length - 1] !== rawCoords[rawCoords.length - 1]) {
      sampled.push(rawCoords[rawCoords.length - 1]);
    }
    plotCoords = [];
    const SUBDIV = 8;
    const TAU = 0.5;
    for (let i = 0; i < sampled.length - 1; i++) {
      const p0 = sampled[Math.max(0, i - 1)];
      const p1 = sampled[i];
      const p2 = sampled[i + 1];
      const p3 = sampled[Math.min(sampled.length - 1, i + 2)];
      for (let s = 0; s < SUBDIV; s++) {
        const t = s / SUBDIV;
        const t2 = t * t;
        const t3 = t2 * t;
        plotCoords.push({
          x: p1.x + TAU * (-p0.x + p2.x) * t + (2 * TAU * p0.x + (TAU - 3) * p1.x + (3 - 2 * TAU) * p2.x - TAU * p3.x) * t2 + (-TAU * p0.x + (2 - TAU) * p1.x + (TAU - 2) * p2.x + TAU * p3.x) * t3,
          y: p1.y + TAU * (-p0.y + p2.y) * t + (2 * TAU * p0.y + (TAU - 3) * p1.y + (3 - 2 * TAU) * p2.y - TAU * p3.y) * t2 + (-TAU * p0.y + (2 - TAU) * p1.y + (TAU - 2) * p2.y + TAU * p3.y) * t3,
        });
      }
    }
    plotCoords.push(sampled[sampled.length - 1]);
  }

  const pts = plotCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const lastX = plotCoords[plotCoords.length - 1].x;
  const lastY = plotCoords[plotCoords.length - 1].y;
  const polygonPts = `${pad},${h - pad} ${pts} ${lastX.toFixed(1)},${h - pad}`;

  const prices = [min, min + range / 2, max].map(p => `₹${p.toFixed(0)}`);
  const yPositions = [h - pad, h / 2, pad + 10];

  const gridLines = yPositions.map(y => `
    <line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#1a1a20" stroke-width="0.5"/>
  `).join('');
  const priceLabels = yPositions.map((y, i) => {
    const pl = prices[i].length * 6 + 4;
    return `<rect x="${w - pad - pl + 2}" y="${y - 7}" width="${pl}" height="13" rx="3" fill="#0a0a0c" opacity="0.8"/>
    <text x="${w - pad}" y="${y}" fill="#555" font-size="10" text-anchor="end" font-family="JetBrains Mono" dominant-baseline="central">${prices[i]}</text>`;
  }).join('');

  const startDate = points[0].date.substring(0, 7);
  const endDate = points[points.length - 1].date.substring(0, 7);

  const gid = `cg-${Math.random().toString(36).slice(2, 8)}`;
  return `<svg viewBox="0 0 ${w} ${h + 14}" style="width:100%;height:auto;display:block;">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <polygon points="${polygonPts}" fill="url(#${gid})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>
    ${priceLabels}
    <circle cx="${pad}" cy="${pts.split(' ')[0].split(',')[1]}" r="4" fill="${color}"/>
    <rect x="${pad + 7}" y="${Number(pts.split(' ')[0].split(',')[1]) - 24}" width="40" height="13" rx="3" fill="#0a0a0c" opacity="0.8"/>
    <text x="${pad + 27}" y="${Number(pts.split(' ')[0].split(',')[1]) - 17}" fill="${color}" font-size="9" font-family="JetBrains Mono, monospace" letter-spacing="1" text-anchor="middle" dominant-baseline="central">START</text>
    ${checkerFlagSVG(lastX, lastY, 26, 4.5)}
    <text x="${pad}" y="${h + 8}" fill="#6b6b76" font-size="10" font-family="JetBrains Mono, monospace">${startDate}</text>
    <text x="${w - pad}" y="${h + 8}" fill="#6b6b76" font-size="10" text-anchor="end" font-family="JetBrains Mono, monospace">${endDate}</text>
  </svg>`;
}

function maxSlope(points: DataPoint[]): number {
  let maxAngle = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = Math.abs(points[i].close - points[i - 1].close);
    const avg = (points[i].close + points[i - 1].close) / 2;
    const angle = Math.atan2(diff, avg) * (180 / Math.PI);
    if (angle > maxAngle) maxAngle = angle;
  }
  return Math.round(maxAngle);
}

export function renderPreGame(
  container: HTMLElement,
  ticker: TickerInfo,
  period: string,
  onPlay?: (ticker: TickerInfo, period: string, smooth: boolean) => void,
  challengeScore?: number,
  challengeHash?: string,
  challengeSmooth?: boolean,
  daily?: boolean,
  challengeGranularity?: 'daily' | 'weekly',
) {
  const crashCoversAll = ticker.crashPeriod &&
    ticker.crashPeriod.start <= ticker.meta.startDate &&
    ticker.crashPeriod.end >= ticker.meta.endDate;
  const isTrustMrr = !!ticker.trustmrr;
  const periods = isTrustMrr
    ? BASE_PERIODS
    : ticker.defunct
    ? ['crash']
    : (ticker.crashPeriod ? ['crash', ...BASE_PERIODS] : BASE_PERIODS);
  const periodsLoading = !isTrustMrr && crashCoversAll && !ticker.defunct;
  let currentPeriod = isTrustMrr ? (period || 'all') : period;
  let currentGranularity: 'daily' | 'weekly' = challengeGranularity || 'weekly';
  let smoothTerrain = challengeSmooth || false;

  const isChallengeLocked = !!(challengeScore && challengeHash) || daily;
  let firstRender = true;
  const canPick = (p: string) => {
    if (isTrustMrr) {
      const src = currentGranularity === 'weekly' ? (ticker.trustmrr?.weeklyDataPoints || (ticker as any).weeklyDataPoints || []) : ticker.dataPoints;
      if (p === 'all') return src.length >= MIN_DATA_POINTS;
      return periodAvailable(src, p, ticker);
    }
    return periodAvailable(ticker.dataPoints, p, ticker) && (!periodsLoading || p === 'crash');
  };
  function recomputeAvailability() {
    if (!isChallengeLocked && !canPick(currentPeriod)) {
      const fallback = periods.find(p => canPick(p));
      if (fallback) currentPeriod = fallback;
    }
    return isChallengeLocked ? canPick(currentPeriod) : periods.some(p => canPick(p));
  }
  let anyAvailable = recomputeAvailability();
  if (!anyAvailable && isTrustMrr && currentGranularity === 'weekly' && !isChallengeLocked) {
    currentGranularity = 'daily';
    anyAvailable = recomputeAvailability();
  }

  function getTrustMrrPoints(): DataPoint[] {
    const src = currentGranularity === 'weekly' ? (ticker.trustmrr?.weeklyDataPoints || (ticker as any).weeklyDataPoints || []) : ticker.dataPoints;
    if (currentPeriod === 'all') return src;
    return filterByPeriod(src, currentPeriod, ticker);
  }

  let filteredPoints = isTrustMrr ? getTrustMrrPoints() : filterByPeriod(ticker.dataPoints, currentPeriod, ticker);
  let challengeVerified = false;

  if (challengeScore && challengeHash) {
    const verifyTicker = isTrustMrr ? `TM:${ticker.trustmrr!.slug}:${currentGranularity}` : ticker.symbol;
    verifyChallenge(verifyTicker, period, challengeScore, challengeHash, challengeSmooth).then(valid => {
      challengeVerified = valid;
      if (valid) render();
    });
  }

  function render() {
    anyAvailable = recomputeAvailability();
    filteredPoints = isTrustMrr ? getTrustMrrPoints() : filterByPeriod(ticker.dataPoints, currentPeriod, ticker);
    const perf = (currentPeriod === '1d' && ticker.dayChangePct !== undefined) ? ticker.dayChangePct : calcPerformance(filteredPoints);
    const diff = calcDifficulty(filteredPoints, isTrustMrr);
    const allTimeRev = isTrustMrr ? filteredPoints.reduce((s, p) => s + p.close, 0) : 0;
    const allTimeRevLabel = ticker.trustmrr?.country ? `${ticker.trustmrr.country} · Listed Indian Tech Unicorn` : '';
    const colors = DIFFICULTY_COLORS[diff];
    const perfStr = perf >= 0 ? `+${perf}%` : `${perf}%`;
    const perfColor = perf >= 0 ? '#5DCAA5' : '#E24B4A';

    const pbId = isTrustMrr && ticker.trustmrr
      ? trackBestId(`TM:${ticker.trustmrr.slug}:${currentGranularity}`, currentPeriod, smoothTerrain)
      : trackBestId(ticker.symbol, currentPeriod, smoothTerrain);
    const pb = getTrackBest(pbId);
    const pbMedal = pb ? medalFor(pb.score) : null;
    const pbHtml = pb ? `<div class="pg-stat"><b style="color:var(--amber)">${pbMedal ? `${pbMedal.emoji} ` : ''}${pb.score.toLocaleString('en-US')}</b><span>your best</span></div>` : '';

    const isChallenge = challengeVerified && challengeScore;
    const isLocked = isChallengeLocked || daily;

    const pills = periods.map(p => {
      const label = p === 'crash' ? 'CRASH' : p === '1d' ? 'LIVE 1D' : p.toUpperCase();
      const locked = !canPick(p) || (isLocked && p !== currentPeriod);
      const isActive = anyAvailable && p === currentPeriod;
      const cls = `period-pill ${isActive ? 'active' : ''}${locked ? ' locked' : ''}`;
      return `<button class="${cls}" data-period="${p}"${locked ? ' disabled' : ''}>${label}</button>`;
    }).join('');

    const challengeBanner = isChallenge ? `
      <div class="challenge-banner">
        <span class="challenge-target">Beat ${challengeScore!.toLocaleString()} pts</span>
      </div>
    ` : '';

    const dailyBanner = daily ? `
      <div class="challenge-banner">
        <span class="daily-badge" style="font-size:12px">DAILY CHALLENGE</span>
      </div>
    ` : '';

    const breadcrumb = `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="#/">Home</a><span class="bc-sep">/</span><a href="${isTrustMrr ? '#/startups' : '#/'}">${isTrustMrr ? 'Unicorns' : 'NSE / BSE'}</a><span class="bc-sep">/</span><span aria-current="page">${isTrustMrr ? ticker.name : ticker.symbol}</span>
      </nav>`;

    const identity = ticker.trustmrr ? `
      <header class="pg-head trustmrr-header">
        <div class="trustmrr-title-row">
          ${ticker.trustmrr.icon ? `<a href="${ticker.trustmrr.website || '#'}" target="_blank" rel="noopener"><img src="${PROXY_URL}/trustmrr-icon/${ticker.trustmrr.slug}" alt="" class="startup-icon"></a>` : ''}
          <div>
            <h1 class="ticker-big">${ticker.trustmrr.website ? `<a href="${ticker.trustmrr.website}" target="_blank" rel="noopener" class="startup-title-link">${ticker.name}</a>` : ticker.name}</h1>
            <span class="company">${[ticker.trustmrr.category, ticker.trustmrr.description].filter(Boolean).join(' · ')}</span>
            <span class="company">${allTimeRevLabel}</span>
            <div class="perf-row" style="margin:8px 0 0">
              <span class="badge" style="color:${colors.text};background:${colors.bg}">${diff.charAt(0).toUpperCase() + diff.slice(1)}</span>
            </div>
          </div>
        </div>
        ${ticker.trustmrr.founder ? `
        <a href="${ticker.trustmrr.xHandle ? `https://x.com/${ticker.trustmrr.xHandle}` : '#'}" target="_blank" rel="noopener" class="founder-card">
          ${ticker.trustmrr.xPicture ? `<img src="${ticker.trustmrr.xPicture}" alt="" class="founder-avatar" referrerpolicy="no-referrer">` : ''}
          <div class="founder-name">${ticker.trustmrr.founder}</div>
        </a>` : ''}
      </header>
      ` : `
      <header class="pg-head">
        <h1 class="ticker-big">${ticker.symbol} <span class="company">${ticker.name}</span></h1>
        <div class="pg-meta">
          <span class="perf" style="color:var(--text-primary);margin-right:6px;font-family:'JetBrains Mono',monospace">₹${(ticker.currentPrice ?? (filteredPoints[filteredPoints.length - 1]?.close || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="perf" style="color:${perfColor}">${perfStr}</span>
          <span class="badge" style="color:${colors.text};background:${colors.bg}">${diff.charAt(0).toUpperCase() + diff.slice(1)}</span>
        </div>
      </header>
      `;

    const controls = isTrustMrr ? `
      <div class="chart-head">
        <div class="pill-set">
          <button class="period-pill${currentGranularity === 'daily' ? ' active' : ''}${isLocked ? ' locked' : ''}" data-granularity="daily"${isLocked ? ' disabled' : ''}>Daily</button>
          <button class="period-pill${currentGranularity === 'weekly' ? ' active' : ''}${isLocked ? ' locked' : ''}" data-granularity="weekly"${isLocked ? ' disabled' : ''}>Weekly</button>
        </div>
        <button class="smooth-toggle ${smoothTerrain ? 'active' : ''}${isLocked ? ' locked' : ''}" id="smooth-btn"${isLocked ? ' disabled' : ''}>Smooth</button>
      </div>
      <div class="chart-head">
        <div class="pill-set">${pills}</div>
      </div>
      ` : `
      <div class="chart-head">
        <div class="pill-set">${pills}</div>
        <button class="smooth-toggle ${smoothTerrain ? 'active' : ''}${isLocked || !anyAvailable ? ' locked' : ''}" id="smooth-btn"${isLocked || !anyAvailable ? ' disabled' : ''}>Smooth</button>
      </div>
      `;

    container.innerHTML = `
      ${navHTML()}
      <main class="content pregame-content"${firstRender ? '' : ' data-rerender'}>
        ${breadcrumb}
        ${identity}
        <section class="chart-card" aria-label="Track preview">
          ${controls}
          <div class="chart-fade">${chartSVG(filteredPoints, smoothTerrain, isTrustMrr ? '#5066FB' : undefined)}</div>
          <div class="pg-stats">
            <div class="pg-stat"><b>${filteredPoints.length}</b><span>points</span></div>
            <div class="pg-stat"><b style="color:${colors.text}">${diff}</b><span>volatility</span></div>
            <div class="pg-stat"><b>${maxSlope(filteredPoints)}°</b><span>max slope</span></div>
            <div class="pg-stat"><b>${currentPeriod.toUpperCase()}</b><span>${ticker.trustmrr ? 'view' : 'period'}</span></div>
            ${pbHtml}
          </div>
        </section>
        <div class="track-lb-card" id="track-lb-card" style="display:none">
          <div id="track-lb-content"></div>
        </div>
        ${dailyBanner}${challengeBanner}
        <div class="cta-zone">
          ${!anyAvailable
            ? `<button class="cta disabled" id="play-btn" disabled>Not enough data</button>`
            : `<button class="cta" id="play-btn">${daily ? 'Ride today\'s challenge' : isChallenge ? 'Take the challenge' : ticker.trustmrr ? `Ride ${currentGranularity} unicorn chart` : 'Ride this chart'}</button>`
          }
          ${ticker.trustmrr ? `<div class="trustmrr-badge">Indian Tech Unicorn Track · NSE / BSE Market Data</div>` : ''}
        </div>
      </main>
      ${footerHTML()}
    `;
    firstRender = false;

    container.querySelectorAll('.period-pill[data-granularity]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentGranularity = (btn as HTMLElement).dataset.granularity as 'daily' | 'weekly';
        render();
      });
    });
    container.querySelectorAll('.period-pill[data-period]:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPeriod = (btn as HTMLElement).dataset.period!;
        render();
      });
    });

    container.querySelector('#smooth-btn')!.addEventListener('click', () => {
      smoothTerrain = !smoothTerrain;
      render();
    });

    container.querySelector('#play-btn')!.addEventListener('click', () => {
      preloadBell().then(() => {
        if (!onPlay) return;
        if (isTrustMrr) {
          const pts = getTrustMrrPoints();
          const tmTicker = { ...ticker, dataPoints: pts, trustmrr: { ...ticker.trustmrr!, granularity: currentGranularity, name: ticker.name } };
          onPlay(tmTicker, currentPeriod, smoothTerrain);
        } else {
          onPlay(ticker, currentPeriod, smoothTerrain);
        }
      });
    });

    if (!isIpoTicker(ticker.symbol) && !daily) {
      fetchTrackLeaderboard(ticker.symbol, currentPeriod).then(lb => {
        if (!lb) return;
        if (!lb.score.length && !lb.time.length) {
          if (!isTrustMrr) showLeaderboardInvite(container);
          return;
        }
        showLeaderboardCard(container, lb);
      }).catch(() => {});
    }
  }

  render();
}

function formatLbTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  return `<span class="country-flag">${String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))}</span>`;
}

function showLeaderboardInvite(container: HTMLElement) {
  const card = container.querySelector('#track-lb-card') as HTMLElement;
  const content = container.querySelector('#track-lb-content') as HTMLElement;
  if (!card || !content) return;
  content.innerHTML = `<div class="tlb-invite">🏁 No records yet — be the first</div>`;
  card.style.display = '';
}

function showLeaderboardCard(container: HTMLElement, lb: TrackLeaderboard) {
  const card = container.querySelector('#track-lb-card') as HTMLElement;
  const content = container.querySelector('#track-lb-content') as HTMLElement;
  if (!card || !content) return;
  const medals = ['🥇', '🥈', '🥉'];
  const scoreRows = lb.score.map((e, i) =>
    `<div class="tlb-row"><span class="tlb-medal">${medals[i]}</span><span class="tlb-name">${e.nickname}${countryFlag(e.country)}</span><span class="tlb-val">${e.score.toLocaleString()}</span></div>`
  ).join('');
  const timeRows = lb.time.map((e, i) =>
    `<div class="tlb-row"><span class="tlb-medal">${medals[i]}</span><span class="tlb-name">${e.nickname}${countryFlag(e.country)}</span><span class="tlb-val">${formatLbTime(e.time)}</span></div>`
  ).join('');
  content.innerHTML = `
    <div class="tlb-columns">
      <div class="tlb-section"><div class="tlb-label">Best Score</div>${scoreRows || '<div class="tlb-empty">No scores yet</div>'}</div>
      <div class="tlb-section"><div class="tlb-label">Fastest Time</div>${timeRows || '<div class="tlb-empty">No times yet</div>'}</div>
    </div>`;
  card.style.display = '';
}

export function getFilteredPoints(ticker: TickerInfo, period: string): DataPoint[] {
  return filterByPeriod(ticker.dataPoints, period, ticker);
}

const IPO_INTERVALS = [
  { key: 'live',  label: 'LIVE',   interval: '5m',  minPoints: MIN_DATA_POINTS },
  { key: '15min', label: '15 MIN', interval: '15m', minPoints: MIN_DATA_POINTS },
  { key: '30min', label: '30 MIN', interval: '30m', minPoints: MIN_DATA_POINTS },
  { key: 'all',   label: 'ALL',    interval: '1d',  minPoints: MIN_DATA_POINTS },
];

export function renderPreGameIpo(
  container: HTMLElement,
  ipoConfig: IpoConfig,
  onPlay: (ticker: TickerInfo, period: string, smooth: boolean) => void,
) {
  let currentInterval = 'live';
  let smoothTerrain = false;
  let currentData: DataPoint[] = [];
  let nextUpdateTime = 0;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  const intervalCache: Record<string, DataPoint[]> = {};

  let destroyed = false;
  let firstRender = true;

  function cleanup() {
    destroyed = true;
    if (refreshTimer) clearInterval(refreshTimer);
    if (countdownTimer) clearInterval(countdownTimer);
  }

  const observer = new MutationObserver(() => {
    if (!container.querySelector('.ipo-live-badge')) { cleanup(); observer.disconnect(); }
  });
  observer.observe(container, { childList: true, subtree: true });

  function getDisplayPoints(): DataPoint[] {
    return currentData;
  }

  function updateChartAndStats() {
    const points = getDisplayPoints();
    const chartBox = container.querySelector('.chart-fade');
    if (chartBox) chartBox.innerHTML = chartSVG(points, smoothTerrain);

    const perf = calcPerformance(points);
    const diff = calcDifficulty(points);
    const colors = DIFFICULTY_COLORS[diff];
    const perfEl = container.querySelector('.perf');
    if (perfEl) {
      (perfEl as HTMLElement).textContent = perf >= 0 ? `+${perf}%` : `${perf}%`;
      (perfEl as HTMLElement).style.color = perf >= 0 ? '#5DCAA5' : '#E24B4A';
    }
    const badge = container.querySelector('.badge');
    if (badge) {
      badge.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
      (badge as HTMLElement).style.color = colors.text;
      (badge as HTMLElement).style.background = colors.bg;
    }
    const statValues = container.querySelectorAll('.pg-stat b');
    if (statValues[0]) statValues[0].textContent = String(points.length);
    if (statValues[1]) { statValues[1].textContent = diff; (statValues[1] as HTMLElement).style.color = colors.text; }
    if (statValues[2]) statValues[2].textContent = `${maxSlope(points)}°`;

    const cta = container.querySelector('#play-btn');
    if (cta && points.length >= MIN_DATA_POINTS && cta.classList.contains('disabled')) {
      cta.classList.remove('disabled');
      (cta as HTMLButtonElement).disabled = false;
      cta.textContent = 'Ride this chart';
    }
  }

  async function fetchInterval(interval: string): Promise<DataPoint[]> {
    const resp = await fetchIpoTicker(ipoConfig.symbol, interval);
    if (!resp || !resp.dataPoints.length) return [];
    if (interval === '5m') nextUpdateTime = resp.nextUpdate;
    intervalCache[interval] = resp.dataPoints;
    return resp.dataPoints;
  }

  async function refresh() {
    if (destroyed || currentInterval !== 'live') return;
    const iv = IPO_INTERVALS.find(i => i.key === currentInterval);
    if (!iv) return;
    try {
      const pts = await fetchInterval(iv.interval);
      if (pts.length && !destroyed) {
        currentData = pts;
        updateChartAndStats();
      }
    } catch {}
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      const el = container.querySelector('.ipo-countdown');
      if (!el) return;
      const remaining = Math.max(0, Math.ceil((nextUpdateTime - Date.now()) / 1000));
      el.textContent = remaining > 3600 ? 'Market closed' : '';
    }, 1000);
  }

  function render() {
    const points = getDisplayPoints();
    const perf = calcPerformance(points);
    const diff = calcDifficulty(points);
    const colors = DIFFICULTY_COLORS[diff];
    const perfStr = perf >= 0 ? `+${perf}%` : `${perf}%`;
    const perfColor = perf >= 0 ? '#5DCAA5' : '#E24B4A';
    const hasEnough = points.length >= MIN_DATA_POINTS;

    const pills = IPO_INTERVALS.filter(iv => {
      if (iv.key === 'live') return true;
      const pts = intervalCache[iv.interval];
      return pts && pts.length >= iv.minPoints;
    }).map(iv => {
      const available = iv.key === 'live' ? hasEnough : true;
      const isActive = iv.key === currentInterval;
      const cls = `period-pill ${isActive ? 'active' : ''}${!available ? ' locked' : ''}`;
      return `<button class="${cls}" data-interval="${iv.key}"${!available ? ' disabled' : ''}>${iv.label}</button>`;
    }).join('');

    container.innerHTML = `
      ${navHTML()}
      <main class="content pregame-content"${firstRender ? '' : ' data-rerender'}>
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="#/">Home</a><span class="bc-sep">/</span><a href="#/">Stocks</a><span class="bc-sep">/</span><span aria-current="page">${ipoConfig.symbol}</span>
        </nav>
        <header class="pg-head">
          <h1 class="ticker-big">${ipoConfig.symbol} <span class="company">${ipoConfig.name}</span> <span class="ipo-live-badge"><span class="live-dot"></span> LIVE</span></h1>
          <div class="pg-meta">
            <span class="perf" style="color:${perfColor}">${perfStr}</span>
            <span class="badge" style="color:${colors.text};background:${colors.bg}">${diff.charAt(0).toUpperCase() + diff.slice(1)}</span>
            <span class="ipo-countdown"></span>
          </div>
        </header>
        <section class="chart-card" aria-label="Track preview">
          <div class="chart-head">
            <div class="pill-set">${pills}</div>
            <button class="smooth-toggle ${smoothTerrain ? 'active' : ''}" id="smooth-btn">Smooth</button>
          </div>
          <div class="chart-fade">${chartSVG(points, smoothTerrain)}</div>
          <div class="pg-stats">
            <div class="pg-stat"><b>${points.length}</b><span>points</span></div>
            <div class="pg-stat"><b style="color:${colors.text}">${diff}</b><span>volatility</span></div>
            <div class="pg-stat"><b>${maxSlope(points)}°</b><span>max slope</span></div>
            <div class="pg-stat"><b>${IPO_INTERVALS.find(i => i.key === currentInterval)?.interval || '5m'}</b><span>interval</span></div>
          </div>
        </section>
        <div class="cta-zone">
          ${hasEnough
            ? '<button class="cta" id="play-btn">Ride this chart</button>'
            : '<button class="cta disabled" id="play-btn" disabled>Not enough data</button>'
          }
        </div>
      </main>
      ${footerHTML()}
    `;
    firstRender = false;

    container.querySelectorAll('.period-pill:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = (btn as HTMLElement).dataset.interval!;
        const iv = IPO_INTERVALS.find(i => i.key === key)!;
        currentInterval = key;
        currentData = intervalCache[iv.interval] || currentData;
        render();
      });
    });

    container.querySelector('#smooth-btn')!.addEventListener('click', () => {
      smoothTerrain = !smoothTerrain;
      render();
    });

    const playBtn = container.querySelector('#play-btn');
    if (playBtn && !playBtn.hasAttribute('disabled')) {
      playBtn.addEventListener('click', () => {
        const iv = IPO_INTERVALS.find(i => i.key === currentInterval)!;
        const ticker = ipoResponseToTickerInfo({ symbol: ipoConfig.symbol, name: ipoConfig.name, interval: iv.interval, dataPoints: getDisplayPoints(), nextUpdate: 0, marketOpen: '', marketClose: '' });
        onPlay(ticker, iv.interval, smoothTerrain);
      });
    }

    startCountdown();
  }

  async function probeOtherIntervals() {
    for (const iv of IPO_INTERVALS) {
      if (destroyed || iv.key === 'live' || intervalCache[iv.interval]) continue;
      try { await fetchInterval(iv.interval); } catch {}
    }
    if (!destroyed) render();
  }

  container.innerHTML = `
    ${navHTML()}
    <main class="content pregame-content" style="text-align:center;padding:120px 20px">
      <div class="ticker-info"><span class="ticker-big">${ipoConfig.symbol}</span> <span class="company">${ipoConfig.name}</span> <span class="ipo-live-badge"><span class="live-dot"></span> LIVE</span></div>
      <div style="color:var(--text-tertiary);margin-top:24px">Loading live data...</div>
    </main>
  `;

  fetchInterval('5m').then(pts => {
    if (destroyed) return;
    currentData = pts;
    render();
    probeOtherIntervals();
    refreshTimer = setInterval(refresh, 300000);
  }).catch(() => {
    if (destroyed) return;
    render();
    refreshTimer = setInterval(refresh, 300000);
  });
}
