import { TickerInfo, fetchLiveTicker, fetchStats, fetchDailyChallenge, ServiceUnavailableError, calcDifficulty, calcPerformance, filterByPeriod, IpoConfig, fetchIpoTicker, isIpoTicker, parseTrustMrrUrl, fetchTrustMrrTicker } from '../data/TickerData';
import { navigate, navigateDaily, navigateIpo, navigateTrustMrr } from '../ui/Router';
import { footerHTML } from '../ui/Footer';
import { navHTML } from '../ui/Nav';
import { icon } from '../ui/icons';
import { mountTrackStrip } from '../ui/TrackStrip';
import { trackEvent } from '../analytics';

let aliveToggleState = false;
let startupMode = false;

const FEATURED_STARTUPS = [
  { slug: 'olaelec', name: 'Ola Electric', description: 'EV two-wheelers & India Gigafactory' },
  { slug: 'policybzr', name: 'Policybazaar', description: 'Digital insurance & Paisabazaar fintech' },
  { slug: 'delhivery', name: 'Delhivery', description: 'Full-stack e-commerce logistics network' },
  { slug: 'angelone', name: 'Angel One', description: 'Discount broking & F&O trading platform' },
  { slug: 'jiofin', name: 'Jio Financial', description: 'Digital NBFC, lending & BlackRock JV' },
  { slug: 'irctc', name: 'IRCTC Digital', description: 'Indian Railways ticketing & catering monopoly' },
  { slug: 'cdsl', name: 'CDSL India', description: 'Depository powering 10+ Cr Demat accounts' },
  { slug: 'bse', name: 'BSE India', description: 'Asia\'s oldest stock exchange, Dalal Street' },
];

const TRENDING_STARTUPS = [
  { slug: 'eternal', name: 'Eternal (Zomato)', description: 'Food delivery & Blinkit quick-commerce leader' },
  { slug: 'swiggy', name: 'Swiggy', description: 'Hyperlocal food delivery & Instamart 10-min grocery' },
  { slug: 'paytm', name: 'Paytm (One97)', description: 'Pioneer of Indian QR & UPI mobile payments' },
  { slug: 'nykaa', name: 'Nykaa', description: 'India\'s largest D2C beauty & fashion platform' },
];

const ALL_STARTUPS = [...TRENDING_STARTUPS, ...FEATURED_STARTUPS];

const TICKER_ALIASES: Record<string, string[]> = {
  'RELIANCE': ['RIL', 'RELIANCE INDUSTRIES', 'JIO', 'MUKESH AMBANI'],
  'ETERNAL': ['ZOMATO', 'BLINKIT', 'DEEPINDER'],
  'TATAMOTORS': ['TATA MOTORS', 'TATA', 'TMPV', 'JLR'],
  'ADANIENT': ['ADANI', 'ADANI ENTERPRISES', 'GAUTAM ADANI'],
  'HAL': ['HINDUSTAN AERONAUTICS', 'TEJAS', 'DEFENCE'],
  'TRENT': ['ZUDIO', 'WESTSIDE', 'TATA TRENT'],
  'INFY': ['INFOSYS', 'NARAYANA MURTHY'],
  'HDFCBANK': ['HDFC', 'HDFC BANK'],
  'NIFTY50': ['NIFTY', 'NIFTY 50', '^NSEI', 'NSE'],
  'SENSEX': ['BSE SENSEX', '^BSESN'],
  'BANKNIFTY': ['BANK NIFTY', 'NIFTY BANK', '^NSEBANK'],
  'TCS': ['TATA CONSULTANCY', 'TATA CONSULTANCY SERVICES'],
  'ICICIBANK': ['ICICI', 'ICICI BANK'],
  'SBIN': ['SBI', 'STATE BANK', 'STATE BANK OF INDIA'],
  'BHARTIARTL': ['AIRTEL', 'BHARTI AIRTEL'],
  'PAYTM': ['ONE97', 'ONE97 COMMUNICATIONS'],
  'YESBANK': ['YES BANK'],
  'IDEA': ['VODAFONE', 'VODAFONE IDEA', 'VI'],
  'SUZLON': ['SUZLON ENERGY'],
  'RPOWER': ['RELIANCE POWER', 'ANIL AMBANI'],
  'RCOM': ['RELIANCE COMMUNICATIONS', 'RELIANCE COMM'],
  'JETAIRWAYS': ['JET', 'JET AIRWAYS'],
  'NYKAA': ['FSN', 'FSN E-COMMERCE'],
  'POLICYBZR': ['POLICYBAZAAR', 'PB FINTECH'],
  'SWIGGY': ['INSTAMART', 'SWIGGY IPO'],
  'OLAELEC': ['OLA', 'OLA ELECTRIC', 'BHAVISH'],
  'HYUNDAI': ['HYUNDAI INDIA', 'HYUNDAI MOTOR'],
  'DMART': ['AVENUE SUPERMARTS', 'RADHAKISHAN DAMANI'],
  'INDIGO': ['INTERGLOBE', 'INTERGLOBE AVIATION'],
  'M&M': ['MAHINDRA', 'MAHINDRA AND MAHINDRA'],
  'BAJFINANCE': ['BAJAJ', 'BAJAJ FINANCE'],
  'MARUTI': ['MARUTI SUZUKI'],
  'IRCTC': ['RAILWAY', 'INDIAN RAILWAYS'],
  'MAZDOCK': ['MAZAGON', 'MAZAGON DOCK'],
};

function sparklineSVG(points: { close: number }[], color: string, height = 56): string {
  if (points.length < 2) return '';
  const min = Math.min(...points.map(p => p.close));
  const max = Math.max(...points.map(p => p.close));
  const range = max - min || 1;
  const w = 280;
  const h = 70;
  const step = w / (points.length - 1);

  const pts = points.map((p, i) =>
    `${(i * step).toFixed(1)},${(h - ((p.close - min) / range) * (h - 4) - 2).toFixed(1)}`
  ).join(' ');

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${height}px;" aria-hidden="true">
    <polyline points="${pts}" pathLength="1" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function stripCloses(points: { close: number }[] | undefined, n = 26): number[] {
  if (!points || points.length < 2) {
    return Array.from({ length: n }, (_, i) => 10 + Math.sin(i / 2.4) * 3 + i * 0.55);
  }
  const step = points.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(points[Math.floor(i * step)].close);
  out.push(points[points.length - 1].close);
  return out;
}

function tameLeadingPeaks(closes: number[]): number[] {
  const lo = Math.min(...closes);
  const range = Math.max(...closes) - lo || 1;
  const win = Math.min(Math.ceil(closes.length * 0.35), closes.length);
  let peak = 0;
  for (let i = 1; i < win; i++) if (closes[i] > closes[peak]) peak = i;
  const cap = lo + range * 0.45;
  return closes.map((v, i) => (i < win && Math.abs(i - peak) > 1 && v > cap ? cap : v));
}

const DIFFICULTY_COLORS: Record<string, { text: string; bg: string }> = {
  easy: { text: '#5DCAA5', bg: '#0F3D2E' },
  medium: { text: '#EF9F27', bg: '#3D2E0A' },
  hard: { text: '#EF9F27', bg: '#3D2E0A' },
  insane: { text: '#E24B4A', bg: '#3D1616' },
};

function diffChip(difficulty: string, id?: string): string {
  const label = difficulty === '—' ? '—' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  return `<span class="diff ${difficulty}"${id ? ` id="${id}"` : ''}><i></i><em>${label}</em></span>`;
}

function formatINR(p: number): string {
  if (p >= 1000) return `₹${p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `₹${p.toFixed(2)}`;
  return `₹${p.toFixed(2)}`;
}

function renderTickerCard(t: TickerInfo, opts: { crashMode?: boolean } = {}): string {
  let sparkPoints: { close: number }[];
  let perfStr: string;
  let chartColor: string;
  let difficulty: TickerInfo['difficulty'];
  const latestClose = t.currentPrice ?? (t.dataPoints.length ? t.dataPoints[t.dataPoints.length - 1].close : 0);
  const priceTag = latestClose > 0 ? ` · <span style="color:var(--text-primary);font-weight:600;font-family:'JetBrains Mono',monospace">${formatINR(latestClose)}</span>` : '';

  if (opts.crashMode && t.crashPeriod) {
    const crashData = t.dataPoints.filter(p => p.date >= t.crashPeriod!.start && p.date <= t.crashPeriod!.end);
    sparkPoints = downsample(crashData, 300);
    difficulty = calcDifficulty(crashData);
    const perf = crashData.length > 1
      ? Math.round(((crashData[crashData.length - 1].close / crashData[0].close) - 1) * 1000) / 10
      : 0;
    perfStr = perf >= 0 ? `+${perf}%` : `${perf}%`;
    chartColor = perf >= 0 ? '#5DCAA5' : '#E24B4A';
  } else {
    const hasIntraday = t.intradayPoints && t.intradayPoints.length >= 20;
    const yearData = filterByPeriod(t.dataPoints, '1y');
    sparkPoints = hasIntraday ? t.intradayPoints! : downsample(yearData, 250);
    difficulty = calcDifficulty(yearData);
    const perf = t.dayChangePct !== undefined ? t.dayChangePct : calcPerformance(yearData);
    perfStr = perf >= 0 ? `+${perf}%` : `${perf}%`;
    chartColor = perf >= 0 ? '#5DCAA5' : '#E24B4A';
  }

  const perfCls = perfStr.startsWith('+') ? 'up' : 'down';
  const deathYear = t.defunct && t.dataPoints.length
    ? ` · †${t.dataPoints[t.dataPoints.length - 1].date.slice(0, 4)}`
    : '';
  const href = opts.crashMode ? `#/${t.symbol}?p=crash` : `#/${t.symbol}`;

  return `
    <a class="ticker-card" href="${href}" data-ticker="${t.symbol}"${opts.crashMode ? ' data-crash="1"' : ''}>
      <div class="ticker-header">
        <span class="ticker-name">${t.symbol}</span>
        ${diffChip(difficulty)}
      </div>
      ${sparklineSVG(sparkPoints, chartColor)}
      <div class="ticker-bot">
        <span class="ticker-subtitle">${t.name}${deathYear}${priceTag}</span>
        <span class="ticker-perf ${perfCls}">${perfStr}</span>
      </div>
    </a>
  `;
}

function renderStartupCard(s: { slug: string; name: string; description: string }): string {
  return `
    <a class="ticker-card startup-card" href="#/trustmrr:${s.slug}" data-trustmrr-slug="${s.slug}">
      <div class="ticker-header">
        <span class="ticker-name">${s.name}</span>
        ${diffChip('—', `badge-${s.slug}`)}
      </div>
      <div class="startup-sparkline" id="sparkline-${s.slug}"></div>
      <div class="ticker-bot">
        <span class="ticker-subtitle" id="subtitle-${s.slug}">${s.description}</span>
        <span class="ticker-perf rev" id="rev-${s.slug}"></span>
      </div>
    </a>
  `;
}

const EA_TILE = `
  <a class="ticker-card ea-tile" href="#/early-access">
    <div class="ea-tile-title">More markets soon</div>
    <div class="ea-tile-sub">NIFTY Midcap · Smallcap 250 · Bank Nifty F&O · Sensex</div>
    <span class="ea-tile-cta">Get early access →</span>
  </a>
`;

function downsample(points: { close: number }[], maxPoints: number): { close: number }[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result: { close: number }[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

export function renderLanding(container: HTMLElement, tickers: TickerInfo[], hallOfFame: TickerInfo[] = [], crashed: TickerInfo[] = [], allLocalTickers?: Record<string, TickerInfo>, ipoList?: IpoConfig[], initialStartupMode?: boolean, prefetchedStartups?: Record<string, TickerInfo>) {
  startupMode = initialStartupMode ?? false;
  const tickerCards = tickers.slice(0, 9).map(t => renderTickerCard(t)).join('');
  const hofCards = hallOfFame.slice(0, 6).map(t => renderTickerCard(t, { crashMode: true })).join('');
  const crashedCards = crashed.slice(0, 6).map(t => renderTickerCard(t, { crashMode: true })).join('');
  const activeIpo = ipoList?.find(c => c.active);

  let stripCleanup: (() => void) | null = null;
  const mountStrip = (isStartup: boolean) => {
    stripCleanup?.();
    stripCleanup = null;
    const el = document.getElementById('track-strip');
    if (!el) return;
    if (isStartup) {
      const first = ALL_STARTUPS.map(s => prefetchedStartups?.[s.slug]).find(t => t);
      const pts = first ? (((first as any).weeklyDataPoints?.length >= 2 ? (first as any).weeklyDataPoints : first.dataPoints)) : undefined;
      stripCleanup = mountTrackStrip(el, tameLeadingPeaks(stripCloses(pts)), '#5066FB');
    } else {
      stripCleanup = mountTrackStrip(el, stripCloses(tickers[0] ? filterByPeriod(tickers[0].dataPoints, '1y') : undefined), '#5DCAA5');
    }
  };

  container.classList.toggle('startup-mode', startupMode);
  container.innerHTML = `
    ${navHTML()}
    <main id="main">
      <header class="hero">
        <img src="./logo.svg" alt="" aria-hidden="true" class="hero-icon hero-icon-left">
        <div class="hero-text">
          <p class="overline" id="hero-overline">${startupMode ? 'Motocross meets Indian Unicorns' : 'Motocross meets Dalal Street'}</p>
          <h1 id="hero-title">${startupMode ? "Ride India's top tech unicorns." : 'Ride any Indian stock chart.'}</h1>
          <div class="track-strip" id="track-strip"></div>
          <div class="live-stats" id="live-stats">
            <div class="live-stat">
              <div class="live-stat-value" id="stat-rides">0</div>
              <div class="live-stat-label">rides completed</div>
            </div>
            <div class="live-stat">
              <div class="live-stat-value accent" id="stat-dollars">₹0</div>
              <div class="live-stat-label" id="stat-dollars-label">${startupMode ? 'virtual revenue ridden' : 'virtual rupees traded'}</div>
            </div>
            <div class="live-stat">
              <div class="live-stat-value" id="stat-crashes">0</div>
              <div class="live-stat-label">total crashes</div>
            </div>
          </div>
        </div>
        <img src="./logo.svg" alt="" aria-hidden="true" class="hero-icon hero-icon-right">
      </header>
      <div class="seg-wrap">
        <div class="seg" role="tablist" aria-label="Game mode">
          <span class="seg-thumb" aria-hidden="true"></span>
          <button class="seg-btn${!startupMode ? ' on' : ''}" id="seg-stocks" role="tab" aria-selected="${!startupMode}">STOCKS</button>
          <button class="seg-btn${startupMode ? ' on blue' : ''}" id="seg-startups" role="tab" aria-selected="${startupMode}">UNICORNS</button>
        </div>
      </div>
      <section class="section" aria-label="Search">
        <form class="search-form" id="search-form" role="search">
          <div class="search-wrapper">
            <input type="text" class="search-input" id="search-input" placeholder="${startupMode ? 'Search Indian unicorns (Zomato, Swiggy, Paytm, Nykaa, Ola...)' : 'Search any NSE / BSE ticker... (RELIANCE, ZOMATO, HAL, TCS, ...)'}" autocomplete="off" spellcheck="false" aria-label="${startupMode ? 'Search startups' : 'Search tickers'}">
            <kbd class="search-kbd">/</kbd>
            <div class="search-dropdown" id="search-dropdown"></div>
          </div>
          <button type="submit" class="search-btn" id="search-btn">Ride</button>
        </form>
        <div class="search-error" id="search-error" role="status"></div>
        <div class="trustmrr-powered" id="trustmrr-powered"${!startupMode ? ' style="display:none"' : ''}>Tracking India's top listed &amp; new-age consumer tech unicorns on NSE &amp; BSE</div>
      </section>
            <div class="daily-banner" id="mp-landing-banner" style="margin-bottom:14px">
        <div class="daily-card" style="border-color:rgba(255,153,51,0.35);background:linear-gradient(135deg,rgba(255,153,51,0.08),rgba(16,185,129,0.04))">
          <div class="daily-left">
            <div class="daily-badge" style="color:#FF9933">🏁 LIVE MULTIPLAYER ROOMS</div>
            <div class="daily-ticker" style="font-size:18px">Race Friends in Real-Time</div>
            <div class="daily-meta">Create a room or enter a friend's code · First to cross the finish line wins!</div>
          </div>
          <div class="daily-actions">
            <a href="#/room" class="daily-cta" style="text-decoration:none;background:#FF9933;color:#0A0C10;font-weight:800">Create / Join Room →</a>
          </div>
        </div>
      </div>
      <div class="daily-banner" id="daily-banner" style="display:none">
        <div class="daily-card">
          <div class="daily-left">
            <div class="daily-badge">⚡ DAILY CHALLENGE</div>
            <div class="daily-ticker" id="daily-ticker"></div>
            <div class="daily-meta" id="daily-meta"></div>
          </div>
          <div class="daily-actions">
            <a href="#/leaderboard" class="daily-lb-link">Leaderboard</a>
            <button class="daily-cta" id="daily-cta">Ride today's challenge</button>
          </div>
        </div>
      </div>
      <section class="section" id="stocks-content"${startupMode ? ' style="display:none"' : ''} aria-label="Stock tracks">
        ${activeIpo ? `
        <h2 class="sec-h"><span>Live IPO</span><span class="live-dot" style="margin-left:2px"></span></h2>
        <div class="ticker-grid ipo-grid" id="ipo-grid">
          <a class="ticker-card ipo-card" id="ipo-card" href="#/${activeIpo.symbol}?ipo=1" data-ticker="${activeIpo.symbol}" data-ipo="1">
            <div class="ticker-header">
              <span class="ticker-name">${activeIpo.symbol}</span>
            </div>
            <div id="ipo-sparkline"></div>
            <div class="ticker-bot"><span class="ticker-subtitle" id="ipo-meta">${activeIpo.name}</span></div>
          </a>
        </div>` : ''}
        <h2 class="sec-h"><span>Trending tracks</span><span class="sec-count">· ${Math.min(9, tickers.length)}</span></h2>
        <div class="ticker-grid">${tickerCards}</div>
        ${crashedCards ? `
        <h2 class="sec-h"><span>Legendary crashes ${icon('skull', 12)}</span><span class="sec-count">· ${crashed.length}</span>
          ${hofCards ? `<span class="sec-right"><label class="alive-toggle"><span class="alive-label">...but still alive</span><input type="checkbox" id="alive-toggle"><span class="toggle-track"><span class="toggle-thumb"></span></span></label></span>` : ''}
        </h2>
        <div class="ticker-grid" id="crashes-grid">${crashedCards}${EA_TILE}</div>` : ''}
      </section>
      <section class="section" id="startups-content"${!startupMode ? ' style="display:none"' : ''} aria-label="Startup tracks">
        <h2 class="sec-h"><span>Consumer Tech Unicorns 🔥</span><span class="sec-count">· ${TRENDING_STARTUPS.length}</span></h2>
        <div class="ticker-grid" id="trending-grid">
          ${TRENDING_STARTUPS.map(renderStartupCard).join('')}
        </div>
        <h2 class="sec-h"><span>Fintech &amp; Digital Infrastructure</span><span class="sec-count">· ${FEATURED_STARTUPS.length}</span></h2>
        <div class="ticker-grid" id="startups-grid">
          ${FEATURED_STARTUPS.map(renderStartupCard).join('')}
          ${EA_TILE}
        </div>
      </section>
    </main>
    ${footerHTML()}
  `;

  mountStrip(startupMode);

  const segEl = container.querySelector('.seg') as HTMLElement | null;
  function updateSegThumb() {
    if (!segEl) return;
    const active = segEl.querySelector('.seg-btn.on') as HTMLElement | null;
    const thumb = segEl.querySelector('.seg-thumb') as HTMLElement | null;
    if (!active || !thumb) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
    thumb.classList.toggle('blue', active.classList.contains('blue'));
  }
  requestAnimationFrame(updateSegThumb);
  if ((document as any).fonts?.ready) (document as any).fonts.ready.then(() => updateSegThumb());
  window.addEventListener('resize', updateSegThumb);

  const aliveToggle = document.getElementById('alive-toggle') as HTMLInputElement | null;
  const crashesGrid = document.getElementById('crashes-grid');
  if (aliveToggle && crashesGrid) {
    aliveToggle.checked = aliveToggleState;
    if (aliveToggleState) crashesGrid.innerHTML = hofCards + EA_TILE;
    aliveToggle.addEventListener('change', () => {
      aliveToggleState = aliveToggle.checked;
      crashesGrid.innerHTML = (aliveToggle.checked ? hofCards : crashedCards) + EA_TILE;
    });
  }

  container.querySelectorAll('.startup-card').forEach(card => {
    card.addEventListener('click', () => {
      const slug = (card as HTMLElement).dataset.trustmrrSlug;
      if (slug) trackEvent('startup_clicked', { slug });
    });
  });

  [...TRENDING_STARTUPS, ...FEATURED_STARTUPS].forEach(s => {
    const ticker = prefetchedStartups?.[s.slug];
    if (!ticker) return;
    const hasWeekly = (ticker as any).weeklyDataPoints?.length >= 2;
    const sparkPoints = hasWeekly ? (ticker as any).weeklyDataPoints : ticker.dataPoints;
    const sparkEl = document.getElementById(`sparkline-${s.slug}`);
    if (sparkEl) sparkEl.innerHTML = sparklineSVG(downsample(sparkPoints, 250), '#5066FB');
    const badge = document.getElementById(`badge-${s.slug}`);
    if (badge) {
      const diff = (ticker as any).difficulty || calcDifficulty(sparkPoints, hasWeekly);
      badge.className = `diff ${diff}`;
      const em = badge.querySelector('em');
      if (em) em.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
    }
    const allTimeRevenue = (ticker as any).meta?.allTimeRevenue || sparkPoints.reduce((sum: number, p: { close: number }) => sum + p.close, 0);
    const fmtRev = allTimeRevenue >= 10_000_000
      ? `₹${(allTimeRevenue / 10_000_000).toFixed(0)} Cr`
      : allTimeRevenue >= 100_000
        ? `₹${(allTimeRevenue / 100_000).toFixed(1)} L`
        : `₹${Math.round(allTimeRevenue).toLocaleString('en-IN')}`;
    const subtitle = document.getElementById(`subtitle-${s.slug}`);
    if (subtitle) subtitle.textContent = ticker.trustmrr?.category || s.description;
    const rev = document.getElementById(`rev-${s.slug}`);
    if (rev) rev.textContent = fmtRev;
  });

  const segStocks = document.getElementById('seg-stocks');
  const segStartups = document.getElementById('seg-startups');
  {
    const stocksContent = document.getElementById('stocks-content');
    const startupsContent = document.getElementById('startups-content');
    const heroTitle = container.querySelector('.hero h1');
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    const heroOverline = document.getElementById('hero-overline');
    const dailyBannerEl = document.getElementById('daily-banner');
    const statDollarsLabel = document.getElementById('stat-dollars-label');
    const trustmrrPowered = document.getElementById('trustmrr-powered');

    function applyMode(isStartup: boolean) {
      startupMode = isStartup;
      const newHash = isStartup ? '#/startups' : '#/';
      if (window.location.hash.replace(/^#\/?/, '') !== newHash.replace(/^#\/?/, '')) {
        window.history.replaceState(null, '', `${window.location.pathname}${newHash}`);
      }
      document.title = isStartup ? 'DalalRider — Ride Indian Tech Unicorns' : 'DalalRider — Ride any NSE & BSE stock chart';
      container.classList.toggle('startup-mode', isStartup);
      segStocks?.classList.toggle('on', !isStartup);
      segStocks?.setAttribute('aria-selected', String(!isStartup));
      segStartups?.classList.toggle('on', isStartup);
      segStartups?.classList.toggle('blue', isStartup);
      segStartups?.setAttribute('aria-selected', String(isStartup));
      if (stocksContent) stocksContent.style.display = isStartup ? 'none' : '';
      if (startupsContent) startupsContent.style.display = isStartup ? '' : 'none';
      if (heroTitle) heroTitle.textContent = isStartup ? "Ride India's top tech unicorns." : 'Ride any Indian stock chart.';
      if (heroOverline) heroOverline.textContent = isStartup ? 'Motocross meets Indian Unicorns' : 'Motocross meets Dalal Street';
      mountStrip(isStartup);
      updateSegThumb();
      if (searchInput) searchInput.placeholder = isStartup
        ? 'Search Indian unicorns (Zomato, Swiggy, Paytm, Nykaa, Ola...)'
        : 'Search any NSE / BSE ticker... (RELIANCE, ZOMATO, HAL, TCS, ...)';
      if (dailyBannerEl && dailyLoaded) dailyBannerEl.style.display = isStartup ? 'none' : '';
      if (statDollarsLabel) statDollarsLabel.textContent = isStartup ? 'virtual revenue ridden' : 'virtual rupees traded';
      if (trustmrrPowered) trustmrrPowered.style.display = isStartup ? '' : 'none';
      loadStats(isStartup ? 'startups' : 'stocks');
    }

    segStocks?.addEventListener('click', () => {
      if (!startupMode) return;
      applyMode(false);
      trackEvent('mode_toggled', { mode: 'stocks' });
    });
    segStartups?.addEventListener('click', () => {
      if (startupMode) return;
      applyMode(true);
      trackEvent('mode_toggled', { mode: 'startups' });
    });
  }

  function loadStats(mode: 'stocks' | 'startups') {
    fetchStats(mode).then(stats => {
      if (!stats) return;
      const wrap = document.getElementById('live-stats');
      if (!wrap) return;
      wrap.classList.add('loaded');
      const targets = [
        { el: document.getElementById('stat-rides')!, value: stats.totalRides, prefix: '' },
        { el: document.getElementById('stat-dollars')!, value: stats.totalDollarsTraded, prefix: '₹' },
        { el: document.getElementById('stat-crashes')!, value: stats.totalCrashes, prefix: '' },
      ];
      const duration = 2000;
      const start = performance.now();
      function tick(now: number) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        for (const s of targets) {
          s.el.textContent = `${s.prefix}${Math.floor(s.value * eased).toLocaleString()}`;
        }
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
  loadStats(startupMode ? 'startups' : 'stocks');

  let dailyLoaded = false;
  fetchDailyChallenge().then(daily => {
    if (!daily) return;
    const banner = document.getElementById('daily-banner');
    if (!banner) return;
    const tickerEl = banner.querySelector('#daily-ticker');
    const metaEl = banner.querySelector('#daily-meta');
    const ctaEl = banner.querySelector('#daily-cta');
    if (!tickerEl || !metaEl || !ctaEl) return;
    dailyLoaded = true;
    if (!startupMode) banner.style.display = '';
    tickerEl.textContent = `${daily.ticker} · ${daily.period.toUpperCase()}`;
    const best = daily.leaderboard[0];
    metaEl.textContent = best
      ? `Best ${best.score.toLocaleString()} — ${best.nickname} · ${daily.totalPlayers} rider${daily.totalPlayers !== 1 ? 's' : ''}`
      : 'No scores yet — be the first!';
    ctaEl.addEventListener('click', () => {
      trackEvent('daily_challenge_clicked', { ticker: daily.ticker, period: daily.period });
      navigateDaily(daily.ticker, daily.period);
    });
  });

  const ipoCard = document.getElementById('ipo-card');
  if (ipoCard && activeIpo) {
    ipoCard.addEventListener('click', () => {
      trackEvent('ipo_clicked', { ticker: activeIpo.symbol });
    });
    fetchIpoTicker(activeIpo.symbol, '5m').then(resp => {
      if (!resp || !resp.dataPoints.length) return;
      const sparkEl = document.getElementById('ipo-sparkline');
      const metaEl = document.getElementById('ipo-meta');
      const color = resp.dataPoints.length >= 2 && resp.dataPoints[resp.dataPoints.length - 1].close >= resp.dataPoints[0].close ? '#5DCAA5' : '#E24B4A';
      if (sparkEl) sparkEl.innerHTML = sparklineSVG(resp.dataPoints, color, 70);
      if (metaEl) {
        const perf = resp.dataPoints.length >= 2
          ? Math.round(((resp.dataPoints[resp.dataPoints.length - 1].close / resp.dataPoints[0].close) - 1) * 1000) / 10
          : 0;
        const price = resp.dataPoints[resp.dataPoints.length - 1].close;
        metaEl.textContent = `${activeIpo.name} · ₹${price.toFixed(2)} · ${perf >= 0 ? '+' : ''}${perf}%`;
      }
    }).catch(() => {});
  }

  const searchForm = document.getElementById('search-form')!;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
  const searchError = document.getElementById('search-error')!;
  const dropdown = document.getElementById('search-dropdown')!;

  let tickerList: { symbol: string; name: string }[] = [];
  fetch('./data/ticker-list.json').then(r => r.json()).then(d => {
    tickerList = d;
    const existing = new Set(tickerList.map(t => t.symbol));
    if (allLocalTickers) {
      for (const t of Object.values(allLocalTickers)) {
        if (!existing.has(t.symbol)) { tickerList.push({ symbol: t.symbol, name: t.name }); existing.add(t.symbol); }
      }
    }
    if (ipoList) {
      for (const cfg of ipoList) {
        if (!existing.has(cfg.symbol)) { tickerList.push({ symbol: cfg.symbol, name: cfg.name }); existing.add(cfg.symbol); }
      }
    }
  });

  let selectedIdx = -1;

  function showSuggestions(query: string) {
    if (!query || query.length < 1) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
    const q = query.toUpperCase();
    const matches = tickerList
      .filter(t => t.symbol.startsWith(q) || t.name.toUpperCase().includes(q) || TICKER_ALIASES[t.symbol]?.some(a => a.startsWith(q)))
      .slice(0, 6);
    if (!matches.length) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
    selectedIdx = -1;
    dropdown.innerHTML = matches.map((t, i) => {
      const skull = allLocalTickers?.[t.symbol]?.defunct ? `<span style="color:var(--text-tertiary);margin-left:4px;display:inline-flex;vertical-align:-1px">${icon('skull', 11)}</span>` : '';
      return `<div class="search-option" data-idx="${i}" data-symbol="${t.symbol}"><span class="search-option-symbol">${t.symbol}${skull}</span><span class="search-option-name">${t.name}</span></div>`;
    }).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.search-option').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const sym = (el as HTMLElement).dataset.symbol!;
        searchInput.value = sym;
        dropdown.style.display = 'none';
        if (isIpoTicker(sym)) { navigateIpo(sym); return; }
        const localTicker = allLocalTickers?.[sym];
        navigate('pregame', sym, localTicker?.defunct ? 'crash' : undefined);
      });
    });
  }

  function showStartupSuggestions(query: string) {
    if (!query || query.length < 1) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
    const q = query.toLowerCase();
    const matches = ALL_STARTUPS.filter(s =>
      s.name.toLowerCase().includes(q) || s.slug.includes(q) || s.description.toLowerCase().includes(q)
    ).slice(0, 6);
    if (!matches.length) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
    selectedIdx = -1;
    dropdown.innerHTML = matches.map((s, i) =>
      `<div class="search-option" data-idx="${i}" data-trustmrr-slug="${s.slug}"><span class="search-option-symbol">${s.name}</span><span class="search-option-name">${s.description}</span></div>`
    ).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.search-option').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const slug = (el as HTMLElement).dataset.trustmrrSlug!;
        dropdown.style.display = 'none';
        navigateTrustMrr(slug);
      });
    });
  }

  searchInput.addEventListener('input', () => {
    searchError.textContent = '';
    if (startupMode) showStartupSuggestions(searchInput.value.trim());
    else showSuggestions(searchInput.value.trim());
  });
  searchInput.addEventListener('focus', () => {
    if (startupMode) showStartupSuggestions(searchInput.value.trim());
    else showSuggestions(searchInput.value.trim());
  });
  searchInput.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 150); });
  searchInput.addEventListener('keydown', (e) => {
    const options = dropdown.querySelectorAll('.search-option');
    if (!options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, options.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); }
    else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      const option = options[selectedIdx] as HTMLElement;
      const tmSlug = option.dataset.trustmrrSlug;
      if (tmSlug) {
        dropdown.style.display = 'none';
        navigateTrustMrr(tmSlug);
        return;
      }
      const sym = option.dataset.symbol!;
      searchInput.value = sym;
      dropdown.style.display = 'none';
      if (isIpoTicker(sym)) { navigateIpo(sym); return; }
      const kbLocal = allLocalTickers?.[sym];
      navigate('pregame', sym, kbLocal?.defunct ? 'crash' : undefined);
      return;
    } else return;
    options.forEach((o, i) => o.classList.toggle('active', i === selectedIdx));
  });

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    dropdown.style.display = 'none';
    const rawInput = searchInput.value.trim();
    if (!rawInput) return;

    const trustmrrSlug = parseTrustMrrUrl(rawInput);
    if (trustmrrSlug) {
      navigateTrustMrr(trustmrrSlug);
      return;
    }

    if (startupMode) {
      const q = rawInput.toLowerCase();
      const match = ALL_STARTUPS.find(s => s.name.toLowerCase() === q || s.slug === q);
      if (match) { navigateTrustMrr(match.slug); return; }
      if (/^[a-z0-9\-]{2,80}$/.test(q)) {
        searchBtn.textContent = '...';
        searchBtn.disabled = true;
        searchError.textContent = '';
        try {
          const ticker = await fetchTrustMrrTicker(q);
          if (ticker) { navigateTrustMrr(q); return; }
          trackEvent('search_failed', { query: rawInput, is_startup: true });
          searchError.textContent = `"${rawInput}" not found in Indian Unicorns.`;
        } catch {
          searchError.textContent = 'Something went wrong. Please try again.';
        }
        searchBtn.textContent = 'Ride';
        searchBtn.disabled = false;
        return;
      }
      searchError.textContent = 'Type an Indian unicorn name (e.g. Zomato, Swiggy, Paytm).';
      return;
    }

    let symbol = rawInput.toUpperCase();

    searchBtn.textContent = '...';
    searchBtn.disabled = true;
    searchError.textContent = '';

    const aliasEntry = Object.entries(TICKER_ALIASES).find(([, aliases]) => aliases.includes(symbol));
    if (aliasEntry) symbol = aliasEntry[0];

    if (!aliasEntry && !allLocalTickers?.[symbol] && symbol.length >= 4) {
      const nameMatches = tickerList.filter(t => t.name.toUpperCase().includes(symbol));
      if (nameMatches.length === 1) symbol = nameMatches[0].symbol;
    }

    if (isIpoTicker(symbol)) {
      navigateIpo(symbol);
      return;
    }

    const local = allLocalTickers?.[symbol];
    if (local) {
      navigate('pregame', local.symbol, local.defunct ? 'crash' : undefined);
      return;
    }

    try {
      const ticker = await fetchLiveTicker(symbol);
      if (ticker) {
        navigate('pregame', ticker.symbol);
      } else {
        trackEvent('search_failed', { query: symbol, is_startup: false });
        searchError.textContent = `"${symbol}" not found. Try another ticker.`;
        searchBtn.textContent = 'Ride';
        searchBtn.disabled = false;
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        searchError.textContent = 'Something went wrong. Please try again in a moment.';
      } else {
        searchError.textContent = `"${symbol}" not found. Try another ticker.`;
      }
      searchBtn.textContent = 'Ride';
      searchBtn.disabled = false;
    }
  });

  let buffer = '';
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    if (e.key === '/') {
      e.preventDefault();
      searchInput.focus();
      return;
    }
    buffer += e.key.toLowerCase();
    if (buffer.length > 6) buffer = buffer.slice(-6);
    if (buffer.endsWith('dalal')) {
      container.querySelectorAll('.hero-icon').forEach(el => {
        if (el.classList.contains('visible')) {
          el.classList.remove('visible');
          el.classList.add('hiding');
          el.addEventListener('animationend', () => el.classList.remove('hiding'), { once: true });
        } else {
          el.classList.remove('hiding');
          el.classList.add('visible');
        }
      });
    }
  };
  document.addEventListener('keydown', onKey);
  const observer = new MutationObserver(() => {
    if (!searchInput.isConnected) {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', updateSegThumb);
      stripCleanup?.();
      stripCleanup = null;
      observer.disconnect();
    }
  });
  observer.observe(container, { childList: true });
}
