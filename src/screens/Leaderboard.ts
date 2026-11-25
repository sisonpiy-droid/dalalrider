import { fetchDailyChallenge, fetchTrackLeaderboard, DailyLeaderboardEntry, getPlayerId } from '../data/TickerData';
import { navigateDaily } from '../ui/Router';
import { footerHTML } from '../ui/Footer';
import { navHTML } from '../ui/Nav';

const LB_TRACKS: { symbol: string; name: string }[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
  { symbol: 'ETERNAL', name: 'Eternal (Zomato)' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises' },
  { symbol: 'HAL', name: 'Hindustan Aeronautics' },
  { symbol: 'TRENT', name: 'Trent (Zudio)' },
  { symbol: 'INFY', name: 'Infosys' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank' },
  { symbol: 'NIFTY50', name: 'NIFTY 50 Index' },
  { symbol: 'YESBANK', name: 'Yes Bank' },
  { symbol: 'SUZLON', name: 'Suzlon Energy' },
  { symbol: 'IDEA', name: 'Vodafone Idea' },
  { symbol: 'RPOWER', name: 'Reliance Power' },
  { symbol: 'PAYTM', name: 'Paytm (One97)' },
  { symbol: 'ZEEL', name: 'Zee Entertainment' },
];
const LB_PERIODS = ['3m', '6m', '1y', 'all'];

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  return `<span class="country-flag">${String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))}</span>`;
}

function formatCountdown(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = tomorrow.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function formatLbTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

function podiumHTML(entries: DailyLeaderboardEntry[], myPlayerId: string): string {
  const steps = [
    { entry: entries[1], cls: 's2', rank: 2 },
    { entry: entries[0], cls: 's1', rank: 1 },
    { entry: entries[2], cls: 's3', rank: 3 },
  ];
  return `<div class="podium">${steps.map(s => s.entry ? `
    <div class="step ${s.cls}${s.entry.playerId === myPlayerId ? ' me' : ''}">
      <div class="step-nick">${escapeHTML(s.entry.nickname)}${countryFlag(s.entry.country)}</div>
      <div class="step-pts">${s.entry.score.toLocaleString()}</div>
      <div class="step-base">${s.rank}</div>
    </div>` : `<div class="step ${s.cls}"></div>`).join('')}</div>`;
}

export function renderLeaderboard(container: HTMLElement) {
  const myPlayerId = getPlayerId();

  container.innerHTML = `
    ${navHTML()}
    <main class="content lb-page" style="max-width:560px;margin:0 auto;padding:20px;width:100%">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="#/">Home</a><span class="bc-sep">/</span><span aria-current="page">Leaderboard</span>
      </nav>
      <section aria-label="Daily challenge">
        <div class="lb-page-header">
          <div class="daily-badge" style="margin-bottom:10px">⚡ DAILY CHALLENGE</div>
          <h1 class="lb-page-ticker" id="lb-ticker">Loading...</h1>
          <div class="lb-page-meta" id="lb-meta"></div>
          <div class="lb-page-countdown" id="lb-countdown"></div>
        </div>
        <div id="lb-content" style="margin-top:18px">
          <div style="text-align:center;color:var(--text-tertiary);padding:40px 0">Loading leaderboard...</div>
        </div>
        <button class="daily-submit-btn" id="lb-play-btn" style="width:100%;margin-top:16px;display:none">Ride today's challenge</button>
      </section>
      <section aria-label="Track records">
        <h2 class="sec-h" style="padding-top:56px"><span>🏁 Track records</span></h2>
        <div class="lb-track-picker">
          <select class="lb-select" id="lb-track-select" aria-label="Track">
            ${LB_TRACKS.map(t => `<option value="${t.symbol}">${t.symbol} — ${t.name}</option>`).join('')}
          </select>
          <select class="lb-select" id="lb-period-select" aria-label="Period">
            ${LB_PERIODS.map(p => `<option value="${p}"${p === '1y' ? ' selected' : ''}>${p.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        <div class="track-lb-card" id="lb-track-result" style="margin-top:12px">
          <div id="lb-track-content"><div class="tlb-empty">Loading…</div></div>
        </div>
        <a class="lb-open-track" id="lb-open-track" href="#/RELIANCE?p=1y">Open this track →</a>
      </section>
    </main>
    ${footerHTML()}
  `;

  fetchDailyChallenge(true).then(daily => {
    if (!daily) {
      const content = document.getElementById('lb-content');
      const tickerLoading = document.getElementById('lb-ticker');
      if (tickerLoading) tickerLoading.textContent = '';
      if (content) content.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:40px 0">Could not load leaderboard</div>';
      return;
    }

    const tickerEl = document.getElementById('lb-ticker');
    const metaEl = document.getElementById('lb-meta');
    const countdownEl = document.getElementById('lb-countdown');
    const contentEl = document.getElementById('lb-content');
    const playBtn = document.getElementById('lb-play-btn');
    if (!tickerEl || !metaEl || !countdownEl || !contentEl || !playBtn) return;

    tickerEl.textContent = `${daily.ticker} · ${daily.period.toUpperCase()}`;
    metaEl.textContent = `${daily.totalPlayers} rider${daily.totalPlayers !== 1 ? 's' : ''} today`;
    countdownEl.textContent = `Next challenge in ${formatCountdown()}`;

    playBtn.style.display = '';
    playBtn.addEventListener('click', () => navigateDaily(daily.ticker, daily.period));

    if (!daily.leaderboard.length) {
      contentEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:30px 0">No scores yet — be the first!</div>';
      return;
    }

    const podium = podiumHTML(daily.leaderboard.slice(0, 3), myPlayerId);
    const rest = daily.leaderboard.slice(3).map((e: DailyLeaderboardEntry, i: number) => {
      const rank = i + 4;
      const isMe = e.playerId === myPlayerId;
      return `<div class="lb-row${isMe ? ' lb-me' : ''}">
        <span class="lb-rank">#${rank}</span>
        <span class="lb-name">${escapeHTML(e.nickname)}${countryFlag(e.country)}</span>
        <span class="lb-score">${e.score.toLocaleString()}</span>
      </div>`;
    }).join('');

    contentEl.innerHTML = `${podium}${rest ? `<div class="lb-list" style="margin-top:10px">${rest}</div>` : ''}`;

    const countdownInterval = setInterval(() => {
      const el = document.getElementById('lb-countdown');
      if (!el) { clearInterval(countdownInterval); return; }
      el.textContent = `Next challenge in ${formatCountdown()}`;
    }, 1000);
  });

  const trackSelect = document.getElementById('lb-track-select') as HTMLSelectElement;
  const periodSelect = document.getElementById('lb-period-select') as HTMLSelectElement;
  const trackContent = document.getElementById('lb-track-content') as HTMLElement;
  const openTrack = document.getElementById('lb-open-track') as HTMLAnchorElement;

  let trackReq = 0;
  function loadTrackBoard() {
    const symbol = trackSelect.value;
    const period = periodSelect.value;
    openTrack.href = `#/${symbol}?p=${period}`;
    trackContent.innerHTML = '<div class="tlb-empty">Loading…</div>';
    const req = ++trackReq;
    fetchTrackLeaderboard(symbol, period).then(lb => {
      if (req !== trackReq || !trackContent) return;
      if (!lb || (!lb.score.length && !lb.time.length)) {
        trackContent.innerHTML = '<div class="tlb-invite">🏁 No records yet — be the first</div>';
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      const scoreRows = lb.score.map((e, i) =>
        `<div class="tlb-row${e.playerId === myPlayerId ? ' tlb-me' : ''}"><span class="tlb-medal">${medals[i]}</span><span class="tlb-name">${escapeHTML(e.nickname)}${countryFlag(e.country)}</span><span class="tlb-val">${e.score.toLocaleString()}</span></div>`
      ).join('');
      const timeRows = lb.time.map((e, i) =>
        `<div class="tlb-row${e.playerId === myPlayerId ? ' tlb-me' : ''}"><span class="tlb-medal">${medals[i]}</span><span class="tlb-name">${escapeHTML(e.nickname)}${countryFlag(e.country)}</span><span class="tlb-val">${formatLbTime(e.time)}</span></div>`
      ).join('');
      trackContent.innerHTML = `
        <div class="tlb-columns">
          <div class="tlb-section"><div class="tlb-label">Best Score</div>${scoreRows || '<div class="tlb-empty">—</div>'}</div>
          <div class="tlb-section"><div class="tlb-label">Fastest Time</div>${timeRows || '<div class="tlb-empty">—</div>'}</div>
        </div>`;
    }).catch(() => {
      if (req !== trackReq) return;
      trackContent.innerHTML = '<div class="tlb-empty">Could not load records</div>';
    });
  }
  trackSelect.addEventListener('change', loadTrackBoard);
  periodSelect.addEventListener('change', loadTrackBoard);
  loadTrackBoard();
}
