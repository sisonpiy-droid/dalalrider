export interface Route {
  screen: string;
  ticker?: string;
  period?: string;
  play?: boolean;
  smooth?: boolean;
  challengeScore?: number;
  challengeHash?: string;
  ghost?: string;
  daily?: boolean;
  ipo?: boolean;
  trustmrr?: boolean;
  startupMode?: boolean;
  granularity?: string;
}

export function parseHash(): Route {
  const pathname = window.location.pathname;
  if (false && pathname.length > 1 && !window.location.hash) {
    const slug = pathname.slice(1);
    const searchParams = new URLSearchParams(window.location.search);
    if (['privacy', 'terms', 'legal', 'contact', 'leaderboard', 'early-access', 'about'].includes(slug)) {
      window.history.replaceState(null, '', `/#/${slug}`);
    } else if (slug === 'startups') {
      window.history.replaceState(null, '', '/#/startups');
    } else if (slug.startsWith('startups/')) {
      const tmSlug = slug.slice(9);
      if (/^[a-z0-9\-]{1,80}$/.test(tmSlug)) {
        let hash = `#/trustmrr:${tmSlug}`;
        const parts: string[] = [];
        const p = searchParams.get('p');
        if (p) parts.push(`p=${p}`);
        const g = searchParams.get('g');
        if (g) parts.push(`g=${g}`);
        if (searchParams.get('smooth') === '1') parts.push('smooth=1');
        const s = searchParams.get('s');
        const h = searchParams.get('h');
        if (s) parts.push(`s=${s}`);
        if (h) parts.push(`h=${h}`);
        const ghost = searchParams.get('ghost');
        if (ghost) parts.push(`ghost=${ghost}`);
        if (parts.length) hash += `?${parts.join('&')}`;
        window.history.replaceState(null, '', `/${hash}`);
      }
    } else if (/^[A-Z0-9.\-]{1,10}$/i.test(slug)) {
      let hash = `#/${slug.toUpperCase()}`;
      const parts: string[] = [];
      const p = searchParams.get('p');
      if (p) parts.push(`p=${p}`);
      if (searchParams.get('play') === '1') parts.push('play=1');
      const s = searchParams.get('s');
      const h = searchParams.get('h');
      if (searchParams.get('smooth') === '1') parts.push('smooth=1');
      if (searchParams.get('daily') === '1') parts.push('daily=1');
      if (searchParams.get('ipo') === '1') parts.push('ipo=1');
      if (s) parts.push(`s=${s}`);
      if (h) parts.push(`h=${h}`);
      const ghost2 = searchParams.get('ghost');
      if (ghost2) parts.push(`ghost=${ghost2}`);
      if (parts.length) hash += `?${parts.join('&')}`;
      window.history.replaceState(null, '', `/${hash}`);
    }
  }

  const hash = window.location.hash.replace('#/', '').replace('#', '');
  if (!hash || hash === '/') return { screen: 'landing' };

  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query || '');

  if (path === 'results') {
    return { screen: 'results', ticker: params.get('t') || undefined, period: params.get('p') || '1y' };
  }

  if (['privacy', 'terms', 'legal', 'contact', 'leaderboard', 'early-access', 'about'].includes(path)) {
    return { screen: path };
  }

  if (path === 'cardlab') {
    return { screen: 'cardlab' };
  }

  if (path === 'startups') {
    return { screen: 'landing', startupMode: true };
  }

  if (path.toLowerCase().startsWith('trustmrr:')) {
    const challengeScore = params.get('s') ? parseInt(params.get('s')!, 10) : undefined;
    const challengeHash = params.get('h') || undefined;
    const ghost = params.get('ghost') || undefined;
    const period = params.get('p') || 'all';
    const smooth = params.get('smooth') === '1';
    const granularity = params.get('g') || undefined;
    return { screen: 'pregame', ticker: path, trustmrr: true, challengeScore, challengeHash, ghost, period, smooth, granularity };
  }

  const play = params.get('play') === '1';
  const smooth = params.get('smooth') === '1';
  const daily = params.get('daily') === '1';
  const ipo = params.get('ipo') === '1';
  const challengeScore = params.get('s') ? parseInt(params.get('s')!, 10) : undefined;
  const challengeHash = params.get('h') || undefined;
  const ghost = params.get('ghost') || undefined;
  return { screen: play ? 'game' : 'pregame', ticker: path.toUpperCase(), period: params.get('p') || '1y', play, smooth, daily, ipo, challengeScore, challengeHash, ghost };
}

export function navigate(screen: string, ticker?: string, period?: string) {
  let hash = '#/';
  if (screen === 'pregame' && ticker) {
    hash = `#/${ticker}`;
    if (period && period !== '1y') hash += `?p=${period}`;
  } else if (screen === 'game' && ticker) {
    hash = `#/${ticker}`;
    if (period) hash += `?p=${period}`;
  } else if (screen === 'results' && ticker) {
    hash = `#/results?t=${ticker}`;
    if (period) hash += `&p=${period}`;
  }
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function navigateDaily(ticker: string, period: string) {
  window.location.hash = `#/${ticker}?p=${period}&daily=1`;
}

export function navigateIpo(ticker: string) {
  window.location.hash = `#/${ticker}?ipo=1`;
}

export function navigateTrustMrr(slug: string) {
  window.location.hash = `#/trustmrr:${slug.toLowerCase()}`;
}

type RouteHandler = (route: Route) => void | Promise<void>;

export function onRouteChange(handler: RouteHandler) {
  const fire = () => handler(parseHash());
  window.addEventListener('hashchange', fire);
  window.addEventListener('popstate', fire);
  fire();
}
