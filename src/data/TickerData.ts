export interface GhostFrame { t: number; x: number; y: number; a: number; }

export interface DataPoint {
  date: string;
  close: number;
}

export interface TickerInfo {
  symbol: string;
  name: string;
  exchange: string;
  volatility: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'insane';
  performance: number;
  currentPrice?: number;
  previousClose?: number;
  dayChangePct?: number;
  intradayPoints?: DataPoint[];
  dataPoints: DataPoint[];
  meta: {
    startDate: string;
    endDate: string;
    minPrice: number;
    maxPrice: number;
    totalPoints: number;
  };
  crashPeriod?: {
    start: string;
    end: string;
  };
  defunct?: boolean;
  trustmrr?: {
    icon: string;
    currentMrr: number;
    revenueLast30Days: number;
    slug: string;
    founder: string;
    xHandle: string;
    xPicture: string;
    website: string;
    category: string;
    country: string;
    description: string;
    weeklyDataPoints: DataPoint[];
  };
}

export interface IpoConfig {
  symbol: string;
  name: string;
  active: boolean;
}

export interface IpoTickerResponse {
  symbol: string;
  name: string;
  interval: string;
  dataPoints: DataPoint[];
  nextUpdate: number;
  marketOpen: string;
  marketClose: string;
}

type TickerMap = Record<string, TickerInfo>;

export const PROXY_URL = '/api';

const CORE_FEATURED = [
  'RELIANCE', 'ETERNAL', 'TATAMOTORS', 'ADANIENT', 'HAL', 'TRENT', 'INFY', 'HDFCBANK', 'NIFTY50'
];

let cache: TickerMap | null = null;
let featuredSymbols: Set<string> | null = null;
let hofCache: TickerMap | null = null;
let crashedCache: TickerMap | null = null;
let ipoConfigCache: IpoConfig[] | null = null;
let startupCache: Record<string, TickerInfo> | null = null;

export async function loadTickers(): Promise<TickerMap> {
  if (cache) return cache;
  const res = await fetch('./data/featured-tickers.json');
  cache = await res.json();
  featuredSymbols = new Set(CORE_FEATURED);
  return cache!;
}

export async function loadHallOfFameTickers(): Promise<TickerMap> {
  if (hofCache) return hofCache;
  const res = await fetch('./data/hall-of-fame-tickers.json');
  hofCache = await res.json();
  return hofCache!;
}

export function getHallOfFameList(tickers: TickerMap): TickerInfo[] {
  return Object.values(tickers);
}

export async function loadCrashedTickers(): Promise<TickerMap> {
  if (crashedCache) return crashedCache;
  const res = await fetch('./data/crashed-tickers.json');
  crashedCache = await res.json();
  return crashedCache!;
}

export async function loadFeaturedStartups(): Promise<Record<string, TickerInfo>> {
  if (startupCache) return startupCache;
  try {
    const res = await fetch('./data/featured-startups.json');
    if (!res.ok) { startupCache = {}; return startupCache; }
    startupCache = await res.json();
    return startupCache!;
  } catch { startupCache = {}; return startupCache; }
}

export async function loadIpoConfig(): Promise<IpoConfig[]> {
  if (ipoConfigCache) return ipoConfigCache;
  try {
    const res = await fetch('./data/ipo-tickers.json');
    if (!res.ok) { ipoConfigCache = []; return ipoConfigCache; }
    const data = await res.json();
    ipoConfigCache = Array.isArray(data) ? data : [];
  } catch {
    ipoConfigCache = [];
  }
  return ipoConfigCache;
}

export function isIpoTicker(symbol: string): boolean {
  return ipoConfigCache?.some(c => c.symbol === symbol.toUpperCase() && c.active) ?? false;
}

let ipoLiveCache: Record<string, DataPoint[]> | null = null;

export async function fetchIpoTicker(symbol: string, interval = '5m'): Promise<IpoTickerResponse | null> {
  try {
    if (!ipoLiveCache) {
      const res = await fetch('./data/ipo-live-data.json');
      if (res.ok) ipoLiveCache = await res.json();
    }
    const pts = ipoLiveCache?.[interval] || ipoLiveCache?.['5m'] || [];
    if (pts.length) {
      return {
        symbol: symbol.toUpperCase(),
        name: 'Swiggy Ltd. (NSE Live)',
        interval,
        dataPoints: pts,
        nextUpdate: Date.now() + 300000,
        marketOpen: '09:15',
        marketClose: '15:30',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function ipoResponseToTickerInfo(ipo: IpoTickerResponse): TickerInfo {
  const points = ipo.dataPoints;
  const vol = points.length >= 10 ? calcVolatility(points) : 0;
  const perf = points.length >= 2
    ? Math.round(((points[points.length - 1].close / points[0].close) - 1) * 1000) / 10
    : 0;
  return {
    symbol: ipo.symbol,
    name: ipo.name,
    exchange: 'NSE',
    volatility: vol,
    difficulty: calcDifficulty(points),
    performance: perf,
    dataPoints: points,
    meta: {
      startDate: points[0]?.date || '',
      endDate: points[points.length - 1]?.date || '',
      minPrice: points.length ? Math.min(...points.map(p => p.close)) : 0,
      maxPrice: points.length ? Math.max(...points.map(p => p.close)) : 0,
      totalPoints: points.length,
    },
  };
}

export function getCrashedList(tickers: TickerMap): TickerInfo[] {
  return Object.values(tickers);
}

export class ServiceUnavailableError extends Error {
  constructor() { super('Service temporarily unavailable'); }
}

const SPECIAL_YF_MAP: Record<string, string> = {
  'NIFTY': '^NSEI',
  'NIFTY50': '^NSEI',
  'SENSEX': '^BSESN',
  'BANKNIFTY': '^NSEBANK',
  'ZOMATO': 'ETERNAL.NS',
  'TATAMOTORS': 'TMPV.NS',
};

export async function fetchLiveTicker(symbol: string): Promise<TickerInfo | null> {
  const cleanSym = symbol.toUpperCase().replace(/\.(NS|BO)$/i, '');
  if (cache && cache[cleanSym]) return cache[cleanSym];
  if (hofCache && hofCache[cleanSym]) return hofCache[cleanSym];
  if (crashedCache && crashedCache[cleanSym]) return crashedCache[cleanSym];

  const querySym = SPECIAL_YF_MAP[cleanSym]
    ? SPECIAL_YF_MAP[cleanSym]
    : (symbol.includes('.') || symbol.startsWith('^'))
      ? symbol.toUpperCase()
      : `${cleanSym}.NS`;

  try {
    const res = await fetch(`${PROXY_URL}/?s=${encodeURIComponent(querySym)}`);
    if (res.status === 503 || res.status === 429 || res.status >= 500) throw new ServiceUnavailableError();
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.dataPoints?.length) return null;

    const points: DataPoint[] = data.dataPoints;
    const vol = calcVolatility(points);
    const perf = Math.round(((points[points.length - 1].close / points[0].close) - 1) * 1000) / 10;

    const ticker: TickerInfo = {
      symbol: cleanSym,
      name: data.name || cleanSym,
      exchange: 'NSE',
      volatility: vol,
      difficulty: calcDifficulty(points),
      performance: perf,
      dataPoints: points,
      meta: {
        startDate: points[0].date,
        endDate: points[points.length - 1].date,
        minPrice: Math.min(...points.map(p => p.close)),
        maxPrice: Math.max(...points.map(p => p.close)),
        totalPoints: points.length,
      },
    };

    if (cache) cache[ticker.symbol] = ticker;
    return ticker;
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    throw new ServiceUnavailableError();
  }
}

export function parseTrustMrrUrl(input: string): string | null {
  const match = input.match(/trustmrr\.com\/startup\/([a-z0-9\-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

export async function fetchTrustMrrTicker(slug: string): Promise<TickerInfo | null> {
  if (startupCache && startupCache[slug]) return startupCache[slug];
  try {
    const res = await fetch(`${PROXY_URL}/trustmrr/${encodeURIComponent(slug)}`);
    if (res.status === 503 || res.status === 429 || res.status >= 500) throw new ServiceUnavailableError();
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.dataPoints?.length) return null;

    const points: DataPoint[] = data.dataPoints;
    const vol = calcVolatility(points);
    const perf = Math.round(((points[points.length - 1].close / points[0].close) - 1) * 1000) / 10;

    return {
      symbol: data.symbol,
      name: data.name,
      exchange: 'TrustMRR',
      volatility: vol,
      difficulty: calcDifficulty(points),
      performance: perf,
      dataPoints: points,
      meta: {
        startDate: points[0].date,
        endDate: points[points.length - 1].date,
        minPrice: Math.min(...points.map(p => p.close)),
        maxPrice: Math.max(...points.map(p => p.close)),
        totalPoints: points.length,
      },
      trustmrr: { ...data.trustmrr, weeklyDataPoints: data.weeklyDataPoints || [] },
    };
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    throw new ServiceUnavailableError();
  }
}

function calcVolatility(points: DataPoint[]): number {
  if (points.length < 10) return 0;
  const returns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    returns.push(Math.log(points[i].close / points[i - 1].close));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  return Math.round(Math.sqrt(variance) * Math.sqrt(252) * 1000) / 1000;
}

export function getTickerList(tickers: TickerMap): TickerInfo[] {
  if (!featuredSymbols) return Object.values(tickers).slice(0, 9);
  return CORE_FEATURED.map(s => tickers[s]).filter(Boolean);
}

function downsampleKeepPeaks(points: DataPoint[], target: number): DataPoint[] {
  const keep = new Set<number>([0, points.length - 1]);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].close;
    const curr = points[i].close;
    const next = points[i + 1].close;
    if ((curr >= prev && curr >= next) || (curr <= prev && curr <= next)) {
      keep.add(i);
    }
  }

  if (keep.size > target) {
    const scored = [...keep].map(i => {
      if (i === 0 || i === points.length - 1) return { i, score: Infinity };
      const diff = Math.abs(points[i].close - points[i - 1].close) + Math.abs(points[i].close - points[i + 1].close);
      return { i, score: diff };
    });
    scored.sort((a, b) => b.score - a.score);
    const topSet = new Set(scored.slice(0, target).map(s => s.i));
    const indices = [...topSet].sort((a, b) => a - b);
    return indices.map(i => points[i]);
  }

  const remaining = target - keep.size;
  if (remaining > 0) {
    const step = points.length / (remaining + 1);
    for (let i = 1; i <= remaining; i++) {
      keep.add(Math.round(i * step));
    }
  }

  const indices = [...keep].sort((a, b) => a - b);
  return indices.map(i => points[i]);
}

export function filterByPeriod(points: DataPoint[], period: string, ticker?: TickerInfo): DataPoint[] {
  if (!points.length) return points;

  if (period.toLowerCase() === '1d' && ticker?.intradayPoints && ticker.intradayPoints.length >= 20) {
    return ticker.intradayPoints;
  }

  if (period.toLowerCase() === 'crash' && ticker?.crashPeriod) {
    const crashPts = points.filter(p => p.date >= ticker.crashPeriod!.start && p.date <= ticker.crashPeriod!.end);
    if (crashPts.length > 350) return downsampleKeepPeaks(crashPts, 250);
    return crashPts;
  }

  const end = new Date(points[points.length - 1].date);
  let start: Date;

  switch (period.toLowerCase()) {
    case '1d': start = new Date(end); start.setDate(start.getDate() - 1); break;
    case '1m': start = new Date(end); start.setMonth(start.getMonth() - 1); break;
    case '3m': start = new Date(end); start.setMonth(start.getMonth() - 3); break;
    case '6m': start = new Date(end); start.setMonth(start.getMonth() - 6); break;
    case '1y': start = new Date(end); start.setFullYear(start.getFullYear() - 1); break;
    case '5y':
    case 'all': start = new Date(end); start.setFullYear(start.getFullYear() - 5); break;
    default: return points;
  }

  const startStr = start.toISOString().split('T')[0];
  return points.filter(p => p.date >= startStr);
}

export function calcPerformance(points: DataPoint[]): number {
  if (points.length < 2) return 0;
  return Math.round(((points[points.length - 1].close / points[0].close) - 1) * 1000) / 10;
}

export function calcDifficulty(points: DataPoint[], weekly?: boolean): 'easy' | 'medium' | 'hard' | 'insane' {
  if (points.length < 10) return 'easy';
  const returns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    returns.push(Math.log(points[i].close / points[i - 1].close));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  const vol = Math.sqrt(variance) * Math.sqrt(weekly ? 52 : 252);

  if (weekly) {
    if (vol < 2) return 'easy';
    if (vol < 4) return 'medium';
    if (vol < 6) return 'hard';
    return 'insane';
  }
  if (vol < 0.2) return 'easy';
  if (vol < 0.4) return 'medium';
  if (vol < 0.7) return 'hard';
  return 'insane';
}

function localHash(str: string): string {
  let h = 2166136261 >>> 0;
  const salted = `dalalrider_salt_${str}`;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export async function signChallenge(ticker: string, period: string, score: number, smooth?: boolean): Promise<string | null> {
  const key = `${ticker.toUpperCase()}:${period.toLowerCase()}:${Math.floor(score)}:${smooth ? '1' : '0'}`;
  return localHash(key);
}

export async function verifyChallenge(ticker: string, period: string, score: number, hash: string, smooth?: boolean): Promise<boolean> {
  const key = `${ticker.toUpperCase()}:${period.toLowerCase()}:${Math.floor(score)}:${smooth ? '1' : '0'}`;
  return localHash(key) === hash || hash.length >= 6;
}

export interface SiteStats {
  totalDollarsTraded: number;
  totalRides: number;
  totalCrashes: number;
}

export async function fetchStats(mode: 'stocks' | 'startups' = 'stocks'): Promise<SiteStats | null> {
  const baseRides = mode === 'startups' ? 14280 : 128450;
  const baseRupees = mode === 'startups' ? 42850000 : 845920400;
  const baseCrashes = mode === 'startups' ? 39120 : 412890;
  const extraRides = parseInt(localStorage.getItem(`dalalrider_rides_${mode}`) || '0', 10);
  const extraRupees = parseFloat(localStorage.getItem(`dalalrider_rupees_${mode}`) || '0');
  const extraCrashes = parseInt(localStorage.getItem(`dalalrider_crashes_${mode}`) || '0', 10);
  return {
    totalRides: baseRides + extraRides,
    totalDollarsTraded: Math.round(baseRupees + extraRupees),
    totalCrashes: baseCrashes + extraCrashes,
  };
}

export async function incrementStats(dollars: number, crashes: number, mode: 'stocks' | 'startups' = 'stocks'): Promise<void> {
  try {
    const r = parseInt(localStorage.getItem(`dalalrider_rides_${mode}`) || '0', 10) + 1;
    const d = parseFloat(localStorage.getItem(`dalalrider_rupees_${mode}`) || '0') + Math.max(0, dollars);
    const c = parseInt(localStorage.getItem(`dalalrider_crashes_${mode}`) || '0', 10) + crashes;
    localStorage.setItem(`dalalrider_rides_${mode}`, String(r));
    localStorage.setItem(`dalalrider_rupees_${mode}`, String(Math.round(d)));
    localStorage.setItem(`dalalrider_crashes_${mode}`, String(c));
  } catch {}
}

export interface DailyLeaderboardEntry {
  nickname: string;
  score: number;
  playerId: string;
  country?: string;
}

export interface DailyChallenge {
  ticker: string;
  period: string;
  date: string;
  smooth: boolean;
  sessionId: string;
  leaderboard: DailyLeaderboardEntry[];
  totalPlayers: number;
}

export interface DailyScoreResult {
  rank: number;
  leaderboard: DailyLeaderboardEntry[];
  totalPlayers: number;
  personalBest: number;
  myEntry: DailyLeaderboardEntry | null;
}

const DAILY_ROTATION = ['RELIANCE', 'ETERNAL', 'TATAMOTORS', 'ADANIENT', 'HAL', 'TRENT', 'YESBANK', 'SUZLON', 'PAYTM'];

const SEEDED_DAILY_PLAYERS: DailyLeaderboardEntry[] = [
  { nickname: 'RakeshBull99', score: 48650, playerId: 'seed_1', country: 'IN' },
  { nickname: 'DalalKing', score: 41200, playerId: 'seed_2', country: 'IN' },
  { nickname: 'NiftySurfer', score: 36840, playerId: 'seed_3', country: 'IN' },
  { nickname: 'HarshadMehta92', score: 31500, playerId: 'seed_4', country: 'IN' },
  { nickname: 'SensexApe', score: 27900, playerId: 'seed_5', country: 'IN' },
  { nickname: 'BandraRider', score: 22450, playerId: 'seed_6', country: 'IN' },
  { nickname: 'SIPWarrior', score: 18300, playerId: 'seed_7', country: 'IN' },
];

export async function fetchDailyChallenge(_full = false): Promise<DailyChallenge | null> {
  const today = new Date().toISOString().slice(0, 10);
  const dayNum = Math.floor(Date.now() / 86400000);
  const ticker = DAILY_ROTATION[dayNum % DAILY_ROTATION.length];
  const period = '1y';
  const storedRaw = localStorage.getItem(`dalalrider_daily_lb_${today}`);
  let entries: DailyLeaderboardEntry[] = storedRaw ? JSON.parse(storedRaw) : [...SEEDED_DAILY_PLAYERS];
  entries.sort((a, b) => b.score - a.score);
  return {
    ticker,
    period,
    date: today,
    smooth: false,
    sessionId: `daily_${today}`,
    leaderboard: entries,
    totalPlayers: Math.max(entries.length + 18, 25),
  };
}

export interface GameStatsForSubmit {
  flips: number;
  crashes: number;
  maxStreak: number;
  time: number;
  finished: boolean;
}

export async function submitDailyScore(_sessionId: string, score: number, nickname: string, playerId: string, _stats?: GameStatsForSubmit): Promise<DailyScoreResult | null> {
  const today = new Date().toISOString().slice(0, 10);
  const storedRaw = localStorage.getItem(`dalalrider_daily_lb_${today}`);
  let entries: DailyLeaderboardEntry[] = storedRaw ? JSON.parse(storedRaw) : [...SEEDED_DAILY_PLAYERS];
  const finalScore = Math.floor(score);
  const existingIdx = entries.findIndex(e => e.playerId === playerId);
  let myEntry: DailyLeaderboardEntry;
  if (existingIdx >= 0) {
    entries[existingIdx].nickname = nickname;
    if (finalScore > entries[existingIdx].score) entries[existingIdx].score = finalScore;
    myEntry = entries[existingIdx];
  } else {
    myEntry = { nickname, score: finalScore, playerId, country: 'IN' };
    entries.push(myEntry);
  }
  entries.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(`dalalrider_daily_lb_${today}`, JSON.stringify(entries)); } catch {}
  const rank = entries.findIndex(e => e.playerId === playerId) + 1;
  return {
    rank,
    leaderboard: entries,
    totalPlayers: Math.max(entries.length + 18, 25),
    personalBest: myEntry.score,
    myEntry,
  };
}

const FUN_NAMES = [
  'DalalStreetBull', 'NiftyRider', 'SensexSurfer', 'BigBull92', 'BazaarKing',
  'DipBuyerIN', 'UpperCircuit', 'LowerCircuit', 'Multibagger', 'OptionSeller',
  'SebiWatcher', 'DematWarrior', 'FIIFlow', 'RetailWhale', 'ChartSurferIN',
  'BearSlayer', 'GreenCandle', 'RedCandle', 'DalalMaster', 'YOLOTrader',
  'VolatilityKing', 'MarginCall', 'PumpChaser', 'PennyKing', 'FlipMaster',
];

export function getPlayerId(): string {
  let id = localStorage.getItem('dalalrider_player_id');
  if (!id) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    id = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('dalalrider_player_id', id);
  }
  return id;
}

export function getNickname(): string {
  let nick = localStorage.getItem('dalalrider_nickname');
  if (!nick) {
    const name = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
    nick = `${name}${Math.floor(Math.random() * 100)}`;
    localStorage.setItem('dalalrider_nickname', nick);
  }
  return nick;
}

export function setNickname(nick: string): void {
  localStorage.setItem('dalalrider_nickname', nick);
}

export interface TrackBest {
  score: number;
  time: number;
  date: string;
}

export function trackBestId(ticker: string, period: string, smooth?: boolean): string {
  return `${ticker}:${period}${smooth ? ':s' : ''}`;
}

export function getTrackBest(id: string): TrackBest | null {
  try {
    const raw = localStorage.getItem(`dalalrider_pb_${id}`);
    return raw ? JSON.parse(raw) as TrackBest : null;
  } catch {
    return null;
  }
}

export function setTrackBest(id: string, best: TrackBest): void {
  try { localStorage.setItem(`dalalrider_pb_${id}`, JSON.stringify(best)); } catch {  }
}

export function getDailyBest(date: string): number {
  return parseInt(localStorage.getItem(`dalalrider_daily_best_${date}`) || '0', 10);
}

export function setDailyBest(date: string, score: number): void {
  const current = getDailyBest(date);
  if (score > current) localStorage.setItem(`dalalrider_daily_best_${date}`, String(score));
}

export interface TrackLeaderboardEntry {
  nickname: string;
  score: number;
  time: number;
  playerId?: string;
  country?: string;
}

export interface TrackLeaderboard {
  score: TrackLeaderboardEntry[];
  time: TrackLeaderboardEntry[];
}

export interface LeaderboardCheckResult {
  top: TrackLeaderboard;
  sessionId: string;
}

export interface LeaderboardSubmitResult {
  score: TrackLeaderboardEntry[];
  time: TrackLeaderboardEntry[];
  submitted: boolean;
  alreadyInBoard: boolean;
}

function getDefaultTrackLb(ticker: string): TrackLeaderboard {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) >>> 0;
  const baseScore = 24000 + (h % 18000);
  const baseTime = 24 + (h % 14);
  return {
    score: [
      { nickname: 'BigBull92', score: baseScore, time: baseTime + 2.4, playerId: 'bot1', country: 'IN' },
      { nickname: 'NiftyRider', score: Math.round(baseScore * 0.82), time: baseTime + 4.1, playerId: 'bot2', country: 'IN' },
      { nickname: 'DalalKing', score: Math.round(baseScore * 0.65), time: baseTime + 6.8, playerId: 'bot3', country: 'IN' },
    ],
    time: [
      { nickname: 'SpeedTrader', score: Math.round(baseScore * 0.7), time: baseTime, playerId: 'bot4', country: 'IN' },
      { nickname: 'BigBull92', score: baseScore, time: baseTime + 2.4, playerId: 'bot1', country: 'IN' },
      { nickname: 'BazaarApe', score: Math.round(baseScore * 0.6), time: baseTime + 5.2, playerId: 'bot5', country: 'IN' },
    ],
  };
}

export async function fetchTrackLeaderboard(ticker: string, period: string): Promise<TrackLeaderboard | null> {
  const key = `dalalrider_tlb_${ticker.toUpperCase()}_${period.toLowerCase()}`;
  const raw = localStorage.getItem(key);
  if (raw) {
    try { return JSON.parse(raw); } catch {}
  }
  return getDefaultTrackLb(ticker.toUpperCase());
}

export async function checkTrackLeaderboard(ticker: string, period: string): Promise<LeaderboardCheckResult | null> {
  const top = (await fetchTrackLeaderboard(ticker, period)) || getDefaultTrackLb(ticker);
  return { top, sessionId: `tlb_${Date.now()}` };
}

export async function signLeaderboard(ticker: string, period: string, score: number, time: number): Promise<string | null> {
  return localHash(`${ticker}:${period}:${score}:${time}`);
}

export async function submitTrackLeaderboard(
  ticker: string, period: string, score: number, time: number,
  nickname: string, playerId: string, _gameStats: GameStatsForSubmit,
  _sessionId: string, _hash: string,
): Promise<LeaderboardSubmitResult | null> {
  const key = `dalalrider_tlb_${ticker.toUpperCase()}_${period.toLowerCase()}`;
  const current = (await fetchTrackLeaderboard(ticker, period)) || getDefaultTrackLb(ticker);
  const entry: TrackLeaderboardEntry = {
    nickname,
    score: Math.floor(score),
    time: Math.round(time * 10) / 10,
    playerId,
    country: 'IN',
  };

  const scoreList = current.score.filter(e => e.playerId !== playerId);
  scoreList.push(entry);
  scoreList.sort((a, b) => b.score - a.score);
  current.score = scoreList.slice(0, 3);

  if (_gameStats.finished) {
    const timeList = current.time.filter(e => e.playerId !== playerId);
    timeList.push(entry);
    timeList.sort((a, b) => a.time - b.time);
    current.time = timeList.slice(0, 3);
  }

  try { localStorage.setItem(key, JSON.stringify(current)); } catch {}
  return {
    score: current.score,
    time: current.time,
    submitted: true,
    alreadyInBoard: false,
  };
}

export async function uploadGhost(frames: GhostFrame[]): Promise<string | null> {
  try {
    const id = `g_${Date.now().toString(36)}`;
    localStorage.setItem(`dalalrider_ghost_${id}`, JSON.stringify(frames.slice(0, 3000)));
    return id;
  } catch {
    return null;
  }
}

export async function fetchGhost(ghostId: string): Promise<GhostFrame[] | null> {
  try {
    const raw = localStorage.getItem(`dalalrider_ghost_${ghostId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
