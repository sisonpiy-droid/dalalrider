if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x: number, y: number, w: number, h: number, radii?: number | number[]) {
    const r = typeof radii === 'number' ? radii : Array.isArray(radii) ? radii[0] ?? 0 : 0;
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

import './styles.css';
import './ui/icons';
import { initAnalytics, trackEvent, captureError } from './analytics';
import { onRouteChange, navigate, Route } from './ui/Router';
import { loadTickers, getTickerList, loadHallOfFameTickers, getHallOfFameList, loadCrashedTickers, getCrashedList, filterByPeriod, calcDifficulty, fetchLiveTicker, fetchDailyChallenge, TickerInfo, GhostFrame, loadIpoConfig, isIpoTicker, IpoConfig, fetchIpoTicker, ipoResponseToTickerInfo, fetchTrustMrrTicker, loadFeaturedStartups, fetchGhost } from './data/TickerData';
import { renderLanding } from './screens/Landing';
import { renderPreGame, renderPreGameIpo } from './screens/PreGame';
import { startGame } from './screens/Game';
import { renderResults } from './screens/Results';
import { renderLegalPage } from './screens/Legal';
import { renderContact } from './screens/Contact';
import { renderAbout } from './screens/About';
import { renderEarlyAccess } from './screens/EarlyAccess';
import { renderLeaderboard as renderLeaderboardPage } from './screens/Leaderboard';

const app = document.getElementById('app')!;
let currentGame: { stop: () => void } | null = null;
let tickerData: Record<string, TickerInfo> | null = null;
let hofData: Record<string, TickerInfo> | null = null;
let crashedData: Record<string, TickerInfo> | null = null;
let ipoConfig: IpoConfig[] = [];
let startupData: Record<string, TickerInfo> = {};

function detectInAppBrowser(): string | null {
  const ua = navigator.userAgent || '';
  if (/FBAN|FBAV/i.test(ua)) return 'facebook';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  if (/Twitter/i.test(ua)) return 'twitter';
  if (/LinkedIn/i.test(ua)) return 'linkedin';
  return null;
}

function showInAppBanner() {
  const inApp = detectInAppBrowser();
  if (!inApp) return;
  const banner = document.getElementById('inapp-banner');
  if (!banner) return;
  banner.style.display = 'block';
  const dismiss = document.getElementById('inapp-dismiss');
  if (dismiss) dismiss.addEventListener('click', () => { banner.style.display = 'none'; });
}

const SITE_ORIGIN = 'https://sisonpiy-droid.github.io/dalalrider';
function setPageMeta(path: string, title: string, description?: string) {
  document.title = title;
  const canon = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canon) canon.href = SITE_ORIGIN + path;
  if (description) {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = description;
  }
}

interface LaunchOptions {
  smooth?: boolean;
  challengeScore?: number;
  ghostFrames?: GhostFrame[];
  daily?: boolean;
  dailySessionId?: string;
  dailyDate?: string;
  ipo?: boolean;
  skipGate?: boolean;
}

function launchGame(ticker: TickerInfo, period: string, opts: LaunchOptions = {}) {
  if (currentGame) { currentGame.stop(); currentGame = null; }
  document.body.classList.add('in-game');
  app.innerHTML = '';
  history.pushState({ game: true }, '', window.location.hash);

  const smooth = opts.smooth || false;
  const points = filterByPeriod(ticker.dataPoints, period, ticker);
  if (points.length < 20) { navigate('landing'); return; }
  const diff = calcDifficulty(points, !!ticker.trustmrr);

  const isStartup = !!ticker.trustmrr;
  trackEvent('game_started', { ticker: ticker.symbol, period, difficulty: diff, smooth, data_points: points.length, challenge: !!opts.challengeScore, daily: !!opts.daily, is_startup: isStartup, granularity: isStartup ? ((ticker.trustmrr as any).granularity || 'weekly') : undefined });

  let capturedGhost: GhostFrame[] | undefined;
  currentGame = startGame(app, points, ticker.symbol, period, {
    onGhostReady: (frames) => { capturedGhost = frames; },
    onFinish: (stats) => {
      document.body.classList.remove('in-game');
      const priceStart = points[0]?.close || 0;
      const priceEnd = points[points.length - 1]?.close || 0;
      trackEvent('game_finished', {
        ticker: ticker.symbol, period, difficulty: diff,
        score: stats.score, flips: stats.flips, crashes: stats.crashes,
        max_streak: stats.maxStreak, finished: stats.finished, time: stats.time,
        time_to_first_crash: stats.timeToFirstCrash,
        coins: stats.coins, coins_total: stats.coinsTotal,
        price_start: priceStart, price_end: priceEnd,
        price_range: Math.abs(priceEnd - priceStart),
        diamond_hands: stats.crashes === 0 && stats.finished,
        paper_hands: stats.timeToFirstCrash >= 0 && stats.timeToFirstCrash <= 10,
        daily: !!opts.daily,
        is_startup: isStartup,
        granularity: isStartup ? ((ticker.trustmrr as any).granularity || 'weekly') : undefined,
      });
      const retryOpts: LaunchOptions = { ...opts, skipGate: true };
      const retryFn = opts.daily
        ? () => fetchDailyChallenge().then(d => {
            if (!d) { launchGame(ticker, period, retryOpts); return; }
            launchGame(ticker, period, { ...retryOpts, dailySessionId: d.sessionId, dailyDate: d.date });
          })
        : opts.ipo
        ? () => fetchIpoTicker(ticker.symbol, '5m').then(resp => {
            if (!resp || resp.dataPoints.length < 20) { launchGame(ticker, period, retryOpts); return; }
            const fresh = ipoResponseToTickerInfo(resp);
            launchGame(fresh, period, retryOpts);
          }).catch(() => launchGame(ticker, period, retryOpts))
        : () => launchGame(ticker, period, retryOpts);
      renderResults(app, stats, ticker.symbol, period, diff, retryFn, points, opts.ipo ? undefined : opts.challengeScore, smooth, opts.daily ? { sessionId: opts.dailySessionId || '', date: opts.dailyDate || '' } : undefined, opts.ipo, !opts.ipo && !opts.daily, ticker.trustmrr, capturedGhost, ticker.name);
    },
  }, {
    smooth, showMarketEvents: true, challengeScore: opts.challengeScore, ghostFrames: opts.ghostFrames, ipo: opts.ipo, skipGate: opts.skipGate,
    tombstone: ticker.defunct ? { label: ticker.name, years: `${ticker.meta.startDate.slice(0, 4)} – ${ticker.meta.endDate.slice(0, 4)}` } : undefined,
    hudIcon: ticker.trustmrr?.icon, hudName: ticker.trustmrr ? ticker.name : undefined, isTrustMrr: !!ticker.trustmrr, founderPicUrl: ticker.trustmrr?.xPicture,
  });
}

async function init() {
  initAnalytics();
  [tickerData, hofData, crashedData, ipoConfig, startupData] = await Promise.all([
    loadTickers(), loadHallOfFameTickers(), loadCrashedTickers(), loadIpoConfig(), loadFeaturedStartups(),
  ]);

  showInAppBanner();

  onRouteChange(async (route: Route) => {
    if (currentGame) { currentGame.stop(); currentGame = null; }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.body.classList.toggle('in-game', route.screen === 'game');
    app.innerHTML = '';
    if (route.screen !== 'landing') window.scrollTo(0, 0);

    const BASE_TITLE = 'DalalRider — Ride any NSE / BSE stock chart';
    switch (route.screen) {
      case 'game': {
        const ticker = tickerData![route.ticker || ''] || hofData?.[route.ticker || ''] || crashedData?.[route.ticker || ''];
        if (!ticker) { navigate('landing'); return; }
        setPageMeta(`/${ticker.symbol}`, `${ticker.symbol} — DalalRider`);
        launchGame(ticker, route.period || '1y', { smooth: route.smooth, challengeScore: route.challengeScore });
        break;
      }
      case 'pregame': {
        const symbol = route.ticker || '';
        if (route.trustmrr) {
          const tmSlug = symbol.replace(/^trustmrr:/i, '').toLowerCase();
          app.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#555;">Loading startup data...</div>';
          try {
            const tmTicker = startupData[tmSlug] || await fetchTrustMrrTicker(tmSlug);
            if (!tmTicker) { navigate('landing'); break; }
            setPageMeta(`/startups/${tmSlug}`, `${tmTicker.name} Revenue — DalalRider`, `Ride ${tmTicker.name}'s real revenue chart on a motocross bike. Free startup revenue game — DalalRider.`);
            const tmPeriod = route.period || 'all';
            const challengeGhostTm = route.ghost
              ? await fetchGhost(route.ghost).catch(() => null) ?? undefined
              : undefined;
            const onPlayTm = (t: TickerInfo, p: string, smooth: boolean) => {
              launchGame(t, p, { smooth, challengeScore: route.challengeScore, ghostFrames: challengeGhostTm });
            };
            renderPreGame(app, tmTicker, tmPeriod, onPlayTm, route.challengeScore, route.challengeHash, route.smooth, false, route.granularity as 'daily' | 'weekly' | undefined);
          } catch (err) {
            captureError(err, { context: 'fetch_trustmrr_ticker', slug: tmSlug });
            navigate('landing');
          }
          break;
        }
        if (isIpoTicker(symbol)) {
          const cfg = ipoConfig.find(c => c.symbol === symbol.toUpperCase());
          if (cfg) {
            setPageMeta(`/${cfg.symbol}`, `${cfg.symbol} Live IPO — DalalRider`, `Ride the ${cfg.name} (${cfg.symbol}) live IPO chart on a motocross bike. Real-time market data becomes your track.`);
            renderPreGameIpo(app, cfg, (t, p, smooth) => {
              launchGame(t, p, { smooth, ipo: true });
            });
            break;
          }
        }
        const period = route.period || '1y';
        const isHofCrash = hofData?.[symbol] && period === 'crash';
        let ticker = (isHofCrash ? hofData![symbol] : null) || tickerData![symbol] || hofData?.[symbol] || crashedData?.[symbol];
        if (!ticker) {
          app.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#555;">Loading ticker...</div>';
          try {
            ticker = await fetchLiveTicker(symbol) as TickerInfo;
            if (ticker && hofData?.[symbol]?.crashPeriod) {
              ticker.crashPeriod = hofData[symbol].crashPeriod;
            }
          } catch (err) {
            captureError(err, { context: 'fetch_live_ticker', symbol });
          }
          if (!ticker) { navigate('landing'); return; }
        }
        const challengeGhost = route.ghost
          ? await fetchGhost(route.ghost).catch(() => null) ?? undefined
          : undefined;
        const onPlay = (t: TickerInfo, p: string, smooth: boolean) => {
          if (route.daily) {
            fetchDailyChallenge().then(daily => {
              if (!daily) { launchGame(t, p, { smooth }); return; }
              launchGame(t, p, { smooth: false, daily: true, dailySessionId: daily.sessionId, dailyDate: daily.date });
            });
          } else {
            launchGame(t, p, { smooth, challengeScore: route.challengeScore, ghostFrames: challengeGhost });
          }
        };
        setPageMeta(`/${ticker.symbol}`, `${ticker.name} (${ticker.symbol}) — DalalRider`, `Ride the ${ticker.name} (${ticker.symbol}) stock chart on a motocross bike. Real market data becomes your track. Free stock chart game — DalalRider.`);
        renderPreGame(app, ticker, period, onPlay, route.challengeScore, route.challengeHash, route.smooth, route.daily);
        if (isHofCrash) {
          fetchLiveTicker(symbol).then(full => {
            if (!full || !app.querySelector('.pregame-content')) return;
            const merged = { ...full, crashPeriod: hofData![symbol].crashPeriod } as TickerInfo;
            const crashEnd = hofData![symbol].crashPeriod!.end;
            const staticPts = hofData![symbol].dataPoints;
            const yahooPts = full.dataPoints.filter((p: {date: string}) => p.date > crashEnd);
            merged.dataPoints = [...staticPts, ...yahooPts];
            merged.meta = {
              ...merged.meta,
              startDate: merged.dataPoints[0].date,
              endDate: merged.dataPoints[merged.dataPoints.length - 1].date,
              totalPoints: merged.dataPoints.length,
            };
            renderPreGame(app, merged, period, onPlay, route.challengeScore, route.challengeHash, route.smooth, route.daily);
          }).catch(() => {});
        }
        break;
      }
      case 'privacy':
      case 'terms':
      case 'legal':
        setPageMeta(`/${route.screen}`, `${route.screen.charAt(0).toUpperCase() + route.screen.slice(1)} — DalalRider`);
        renderLegalPage(app, route.screen);
        break;
      case 'contact':
        setPageMeta('/contact', 'Contact — DalalRider', 'Get in touch with DalalRider — partnerships, advertising, data removal requests.');
        renderContact(app);
        break;
      case 'early-access':
        setPageMeta('/early-access', 'Early Access — DalalRider', 'Join the DalalRider early access waitlist: global markets, more crypto, forex, and intraday charts.');
        renderEarlyAccess(app);
        break;
      case 'about':
        setPageMeta('/about', 'About DalalRider — the stock chart riding game', 'DalalRider is a free browser game that turns real stock market charts into motocross tracks. Learn how it works, who made it, and where the data comes from.');
        renderAbout(app);
        break;
      case 'leaderboard':
        setPageMeta('/leaderboard', 'Daily challenge leaderboard — DalalRider', "DalalRider daily challenge leaderboard. Every day a new stock chart to ride — same track for everyone.");
        renderLeaderboardPage(app);
        break;
      case 'cardlab': {
        if (import.meta.env.DEV) {
          document.title = 'Share Card Lab — DalalRider';
          const { renderShareCardLab } = await import('./screens/ShareCardLab');
          renderShareCardLab(app);
        } else {
          navigate('landing');
        }
        break;
      }
      default:
        if (route.startupMode) {
          setPageMeta('/startups', 'DalalRider — Ride startup revenue charts', 'Ride startup revenue on a motocross bike. Real revenue data from TrustMRR becomes your motocross track. Free browser game.');
        } else {
          setPageMeta('/', BASE_TITLE, 'Ride any stock chart on a motocross bike. DalalRider is a free browser game where real market data becomes your track. Ride Tesla, Bitcoin, Enron and 40+ stock charts. No download.');
        }
        renderLanding(app, getTickerList(tickerData!), hofData ? getHallOfFameList(hofData) : [], crashedData ? getCrashedList(crashedData) : [], { ...(tickerData || {}), ...(hofData || {}), ...(crashedData || {}) }, ipoConfig, route.startupMode, startupData);
        break;
    }
  });
}

init().catch((err) => {
  captureError(err, { context: 'app_init' });
});
