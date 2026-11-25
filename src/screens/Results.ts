import { GameStats } from './Game';
import { navigate } from '../ui/Router';
import { CARD_VARIANTS, CardInput, topPercent, medalFor } from './ShareCardVariants';
import { icon } from '../ui/icons';
import { trackEvent, captureError } from '../analytics';
import { playNamedCombo } from '../sound';
import { signChallenge, uploadGhost, submitDailyScore, getPlayerId, getNickname, setNickname, getDailyBest, setDailyBest, DailyLeaderboardEntry, checkTrackLeaderboard, signLeaderboard, submitTrackLeaderboard, TrackLeaderboardEntry, GameStatsForSubmit, GhostFrame, trackBestId, getTrackBest, setTrackBest } from '../data/TickerData';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  return `<span class="country-flag">${String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65))}</span>`;
}

export interface DailyInfo {
  sessionId: string;
  date: string;
}

const CHIP_LABELS: Record<string, string> = {
  versus: 'VS', pnl: 'P&L', terminal: 'Terminal', receipt: 'Receipt',
  holo: 'Card', poster: 'Poster', report: 'Report',
};

export function renderResults(
  container: HTMLElement,
  stats: GameStats,
  ticker: string,
  period: string,
  difficulty: string,
  onRetry: () => void,
  dataPoints?: { date: string; close: number }[],
  challengeScore?: number,
  smooth?: boolean,
  dailyInfo?: DailyInfo,
  ipo?: boolean,
  trackLb?: boolean,
  trustmrrInfo?: { slug: string; founder: string; xHandle: string; icon: string; website: string; currentMrr: number; [key: string]: unknown },
  ghostFrames?: GhostFrame[],
  tickerName?: string,
) {
  const overlay = document.createElement('div');
  overlay.className = 'results-overlay';
  document.body.style.overflow = 'hidden';

  const challengeWon = challengeScore != null && stats.score >= challengeScore;
  const challengeResult = challengeScore != null ? `
    <div class="challenge-result ${challengeWon ? 'challenge-won' : 'challenge-lost'}">
      <div class="challenge-verdict">${challengeWon ? 'Challenge beaten!' : 'Challenge failed'}</div>
      <div class="challenge-comparison">${stats.score.toLocaleString()} vs ${challengeScore.toLocaleString()} pts</div>
    </div>
  ` : '';

  const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><rect x="128" y="128" width="336" height="336" rx="57"/><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24"/></svg>`;
  const xIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;

  const isTrustMrr = !!trustmrrInfo;
  const smoothParam = smooth ? '&smooth=1' : '';
  const fallbackUrl = ipo
    ? `${window.location.origin}${window.location.pathname}#/${ticker}?ipo=1`
    : isTrustMrr
      ? `${window.location.origin}${window.location.pathname}#/trustmrr:${trustmrrInfo!.slug}`
      : `${window.location.origin}${window.location.pathname}#/${ticker}?p=${period}&play=1${smoothParam}`;
  let shareUrl = fallbackUrl;

  const isMobile = 'ontouchstart' in window && 'share' in navigator;
  const isDisaster = stats.score < 2000 || stats.crashes >= 10;

  const timeStr = formatTime(stats.time);
  const tmStartupName = isTrustMrr ? ((trustmrrInfo as any)?.name || ticker) : '';
  const tmGranularity = (trustmrrInfo as any)?.granularity || 'weekly';

  const pbId = isTrustMrr
    ? trackBestId(`TM:${trustmrrInfo!.slug}:${tmGranularity}`, period, smooth)
    : trackBestId(ticker, period, smooth);
  const prevBest = getTrackBest(pbId);
  const isNewPb = prevBest !== null && stats.score > prevBest.score;
  if (prevBest === null || stats.score > prevBest.score) {
    setTrackBest(pbId, { score: stats.score, time: stats.time, date: new Date().toISOString().slice(0, 10) });
  }
  const medal = medalFor(stats.score);
  const tp = topPercent(stats.score);
  const medalHtml = medal && !isDisaster ? `<span class="rc-medal">${medal.emoji} Top ${tp}% worldwide</span>` : '';
  const pbHtml = isNewPb
    ? `<span class="rc-pb rc-pb-new">NEW BEST!<s>${prevBest!.score.toLocaleString('en-US')}</s></span>`
    : prevBest ? `<span class="rc-pb">Your best: ${prevBest.score.toLocaleString('en-US')}</span>` : '';

  const nickname = getNickname() || 'Rider';
  const cardInput: CardInput = {
    score: stats.score,
    ticker,
    name: isTrustMrr ? tmStartupName : (tickerName || ticker),
    period,
    difficulty,
    time: stats.time,
    crashes: stats.crashes,
    maxStreak: stats.maxStreak,
    flips: stats.flips,
    finished: stats.finished,
    disaster: isDisaster,
    worldRecord: false,
    nickname,
    dataPoints: dataPoints || [],
    tricks: stats.tricks || {},
    events: stats.events || [],
    isStartup: isTrustMrr,
    slug: trustmrrInfo?.slug,
    founderHandle: trustmrrInfo?.xHandle,
    granularity: tmGranularity,
    challengeScore,
  };

  const offeredVariants = CARD_VARIANTS.filter(v => !v.requiresChallenge || challengeScore != null);
  const savedVariant = localStorage.getItem('sr_card_variant') || '';
  let selectedVariant =
    challengeScore != null ? 'versus'
    : offeredVariants.some(v => v.id === savedVariant) ? savedVariant
    : isDisaster ? 'report'
    : 'pnl';

  const fmtPts = (n: number) => n.toLocaleString('en-US');
  function buildShareText(): string {
    const scoreStr = fmtPts(stats.score);
    const bits: string[] = [];
    if (stats.maxStreak > 1) bits.push(`🔥 ×${stats.maxStreak} streak`);
    if (stats.crashes > 0) bits.push(`💀 ${stats.crashes} crash${stats.crashes > 1 ? 'es' : ''}`);
    bits.push(`⏱ ${timeStr}`);
    const stat = bits.join(' · ');
    const wr = cardInput.worldRecord;

    if (challengeScore != null && !wr) {
      const label = isTrustMrr ? `${tmStartupName}'s revenue chart` : `$${ticker} (${period.toUpperCase()})`;
      return challengeWon
        ? `Challenge beaten 😤 ${scoreStr} vs ${fmtPts(challengeScore)} pts on ${label} 🏍️\n${stat}\n\nYour turn:`
        : `Lost this challenge 🥲 ${scoreStr} vs ${fmtPts(challengeScore)} pts on ${label} 🏍️\n\nAvenge me:`;
    }
    if (isTrustMrr) {
      const founderTag = trustmrrInfo?.xHandle ? `@${trustmrrInfo.xHandle}` : tmStartupName;
      if (wr) return `👑 WORLD RECORD riding ${founderTag}'s revenue chart 🏍️\n${tmStartupName} · ${scoreStr} pts · ${stat}\ndata from @trust_mrr\n\nCome take my crown:`;
      if (isDisaster) return `I crashed ${stats.crashes} times riding ${founderTag}'s revenue chart 🏍️💀\n${tmStartupName} · ${scoreStr} pts · certified paper hands\n\nDo better:`;
      return `I just rode ${founderTag}'s revenue chart like a motocross track 🏍️\n${tmStartupName} · ${scoreStr} pts · ${stat}\ndata from @trust_mrr\n\nRide it yourself:`;
    }
    const tag = `$${ticker}`;
    if (wr) return `👑 NEW WORLD RECORD riding ${tag} (${period.toUpperCase()}) on DalalRider 🏍️\n${scoreStr} pts · ${stat}\n\nCome take my crown:`;
    if (isDisaster) return `I just went bankrupt riding ${tag} (in a video game) 🏍️💀\n${scoreStr} pts · ${stats.crashes} crashes · certified paper hands\n\nBeat that. The bar is on the floor:`;
    const tp = topPercent(stats.score);
    const rank = tp <= 50 ? `⭐ Top ${tp}% worldwide · ` : '';
    return `${scoreStr} pts riding the ${tag} chart 🏍️\n${rank}${stat}\n\nThink you can beat me?`;
  }
  let shareTextRaw = buildShareText();
  const shareTextEnc = encodeURIComponent(shareTextRaw);
  const fallbackUrlEnc = encodeURIComponent(fallbackUrl);
  const clipboardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><path d="M336 64h32a48 48 0 0148 48v320a48 48 0 01-48 48H144a48 48 0 01-48-48V112a48 48 0 0148-48h32"/><rect x="176" y="16" width="160" height="80" rx="26" ry="26"/></svg>`;
  const checkCircleIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 512 512" fill="none" stroke="#5DCAA5" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"><polyline points="416 128 192 384 96 288"/></svg>`;

  overlay.innerHTML = `
    <div class="share-card${isDisaster ? ' disaster' : ''}">
      ${challengeResult}
      <div class="results-overline" style="text-align:center;${isDisaster ? 'color:#E24B4A' : ''}">${isDisaster ? 'Total wipeout' : stats.finished ? 'Run complete' : 'Game over'}</div>
      <div class="rc-score${isDisaster ? ' disaster' : ''}"><span id="rc-score-num">0</span><span class="rc-pts">pts</span></div>
      <div class="rc-sub" id="rc-sub">${medalHtml}${pbHtml}</div>
      <div class="share-body">
        <div class="share-section-label">Challenge a friend</div>
        <div class="share-link-row">
          <input type="text" class="share-link-input" value="${fallbackUrl}" readonly id="share-link" aria-label="Challenge link">
          <button class="share-copy-btn" id="share-copy" aria-label="Copy challenge link">${copyIcon}</button>
        </div>
        <div class="share-visual">
          <div class="share-preview" style="display:none"><img src="" alt="Score card" style="display:none"></div>
          <div class="share-spinner">Generating image...</div>
          <div class="card-picker" role="tablist" aria-label="Card style">
            ${offeredVariants.map(v => `<button class="cp-chip${v.id === selectedVariant ? ' active' : ''}" data-v="${v.id}" role="tab" aria-selected="${v.id === selectedVariant}">${CHIP_LABELS[v.id] || v.title}</button>`).join('')}
          </div>
        </div>
        <a href="https://x.com/intent/tweet?text=${shareTextEnc}%0A${fallbackUrlEnc}" target="_blank" class="share-x-btn" id="share-x" aria-label="Post on X"><span class="ss-icon">${xIcon}</span><span>Post on X</span></a>
        <div class="share-socials">
          <button class="share-social" id="share-clipboard" aria-label="Copy share text"><span class="ss-icon">${clipboardIcon}</span><span class="ss-label">Copy</span></button>
          <button class="share-social" id="share-save" aria-label="Save image" style="display:none"><span class="ss-icon">${icon('download-outline', 20)}</span><span class="ss-label">Save</span></button>
          ${isMobile ? `<button class="share-social" id="share-native" aria-label="Share with image" style="display:none"><span class="ss-icon">${icon('share-outline', 20)}</span><span class="ss-label">Share</span></button>` : ''}
        </div>
        ${dailyInfo ? `
        <div class="daily-submit" id="daily-submit-section">
          <input type="text" class="daily-nick-input" id="daily-nick" value="${escapeHTML(getNickname())}" maxlength="20" placeholder="Nickname">
          <button class="daily-submit-btn" id="daily-submit-btn">Submit score</button>
          <div id="daily-leaderboard"></div>
        </div>` : ''}
        <div id="track-lb-section"></div>
        <div class="btn-row">
          <button class="btn-primary" id="results-retry">${dailyInfo ? 'Retry challenge' : 'Retry'}<kbd class="retry-kbd desktop-only">R</kbd></button>
          <button class="btn-secondary" id="results-new">New track</button>
        </div>
        ${trustmrrInfo ? `<div class="trustmrr-badge" style="margin-bottom:12px">Indian Unicorn Track · DalalRider</div>` : ''}
        <a href="https://github.com/sisonpiy-droid/dalalrider" target="_blank" rel="noopener" class="kofi-link"><span class="kofi-icon">⭐</span> Built by sisonpiy-droid · Star DalalRider on GitHub</a>
      </div>
    </div>
  `;

  container.appendChild(overlay);

  {
    const numEl = overlay.querySelector('#rc-score-num') as HTMLElement;
    const subEl = overlay.querySelector('#rc-sub') as HTMLElement;
    const reveal = () => {
      subEl.classList.add('show');
      if (isNewPb) playNamedCombo();
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || stats.score <= 0) {
      numEl.textContent = fmtPts(stats.score);
      reveal();
    } else {
      const dur = 900;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (!document.body.contains(numEl)) return;
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        numEl.textContent = fmtPts(Math.round(stats.score * eased));
        if (p < 1) requestAnimationFrame(tick);
        else reveal();
      };
      requestAnimationFrame(tick);
    }
  }

  const onResultsKey = (e: KeyboardEvent) => {
    if (!document.body.contains(overlay)) { window.removeEventListener('keydown', onResultsKey); return; }
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    const enterOnControl = e.code === 'Enter' && (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement);
    if ((e.code === 'KeyR' || e.code === 'Enter') && !enterOnControl) {
      e.preventDefault();
      (overlay.querySelector('#results-retry') as HTMLButtonElement)?.click();
    }
  };
  window.addEventListener('keydown', onResultsKey);

  const cardUrls = new Map<string, string>();
  const cardBlobs = new Map<string, Blob>();

  async function showCard(id: string) {
    selectedVariant = id;
    overlay.querySelectorAll('.cp-chip').forEach(c => {
      const active = (c as HTMLElement).dataset.v === id;
      c.classList.toggle('active', active);
      c.setAttribute('aria-selected', String(active));
    });
    const reveal = (url: string) => {
      const img = overlay.querySelector('.share-preview img') as HTMLImageElement;
      const preview = overlay.querySelector('.share-preview') as HTMLElement;
      if (img) { img.src = url; img.style.display = 'block'; }
      if (preview) preview.style.display = 'block';
      overlay.querySelector('.share-spinner')?.remove();
      const saveBtn = overlay.querySelector('#share-save') as HTMLElement | null;
      if (saveBtn) saveBtn.style.display = '';
      const nativeBtn = overlay.querySelector('#share-native') as HTMLElement | null;
      if (nativeBtn) nativeBtn.style.display = '';
    };
    const cached = cardUrls.get(id);
    if (cached) { reveal(cached); return; }
    const variant = CARD_VARIANTS.find(v => v.id === id);
    if (!variant) return;
    try {
      const canvas = await variant.render(cardInput);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.9));
      const url = URL.createObjectURL(blob);
      cardUrls.set(id, url);
      cardBlobs.set(id, blob);
      if (selectedVariant === id) reveal(url);
    } catch (err) {
      captureError(err, { context: 'share_card_generation', ticker, variant: id });
      const spinner = overlay.querySelector('.share-spinner');
      if (spinner) spinner.textContent = 'Image failed to load';
    }
  }

  overlay.querySelectorAll('.cp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = (chip as HTMLElement).dataset.v!;
      localStorage.setItem('sr_card_variant', id);
      showCard(id);
    });
  });
  showCard(selectedVariant);

  if (!ipo) {
    const challengeTicker = isTrustMrr ? `TM:${trustmrrInfo!.slug}:${tmGranularity}` : ticker;
    const ghostUpload = ghostFrames?.length ? uploadGhost(ghostFrames).catch(() => null) : Promise.resolve(null);
    Promise.all([
      signChallenge(challengeTicker, period, stats.score, smooth),
      ghostUpload,
    ]).then(([hash, ghostId]) => {
      if (!hash) return;
      const ghostParam = ghostId ? `&ghost=${ghostId}` : '';
      shareUrl = isTrustMrr
        ? `${window.location.origin}${window.location.pathname}#/trustmrr:${trustmrrInfo!.slug}?p=${period}&g=${tmGranularity}&s=${stats.score}&h=${hash}${smoothParam}${ghostParam}`
        : `${window.location.origin}${window.location.pathname}#/${ticker}?p=${period}&s=${stats.score}&h=${hash}${smoothParam}${ghostParam}`;
      const input = overlay.querySelector('#share-link') as HTMLInputElement;
      if (input) input.value = shareUrl;
      const updatedTextEnc = encodeURIComponent(shareTextRaw);
      const updatedUrlEnc = encodeURIComponent(shareUrl);
      const xLink = overlay.querySelector('#share-x') as HTMLAnchorElement;
      if (xLink) xLink.href = `https://x.com/intent/tweet?text=${updatedTextEnc}%0A${updatedUrlEnc}`;
    }).catch(() => {});
  }

  if (dailyInfo) {
    setDailyBest(dailyInfo.date, stats.score);
    const submitBtn = overlay.querySelector('#daily-submit-btn') as HTMLButtonElement;
    const nickInput = overlay.querySelector('#daily-nick') as HTMLInputElement;
    const submitSection = overlay.querySelector('#daily-submit-section')!;

    submitBtn.addEventListener('click', async () => {
      const nick = nickInput.value.trim().replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 20) || getNickname();
      setNickname(nick);
      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      const gameStats = { flips: stats.flips, crashes: stats.crashes, maxStreak: stats.maxStreak, time: stats.time, finished: stats.finished };
      const result = await submitDailyScore(dailyInfo.sessionId, stats.score, nick, getPlayerId(), gameStats);
      if (result) {
        setDailyBest(dailyInfo.date, result.personalBest);
        const notImproved = result.personalBest > stats.score;
        submitSection.innerHTML = `
          <div class="daily-rank-badge">#${result.rank} of ${result.totalPlayers}${notImproved ? `<div class="daily-best-hint">Your best: ${result.personalBest.toLocaleString()} pts</div>` : ''}</div>
          ${renderLeaderboard(result.leaderboard, getPlayerId(), result.rank, result.myEntry)}
        `;
      } else {
        submitBtn.textContent = 'Failed — retry';
        submitBtn.disabled = false;
      }
    });
  }

  const trackShare = (action: string, extra?: Record<string, unknown>) => {
    trackEvent('share_clicked', { action, ticker, score: stats.score, isDisaster, is_startup: isTrustMrr, card_variant: selectedVariant, ...extra });
  };

  overlay.querySelector('#share-x')!.addEventListener('click', () => trackShare('x'));

  overlay.querySelector('#share-clipboard')!.addEventListener('click', async () => {
    const btn = overlay.querySelector('#share-clipboard') as HTMLButtonElement;
    const textToCopy = `${shareTextRaw}\n${shareUrl}`;
    try { await navigator.clipboard.writeText(textToCopy); } catch {  }
    setShareButtonState(btn, checkCircleIcon, 'Copied!');
    btn.style.borderColor = '#5DCAA5';
    trackShare('clipboard');
    setTimeout(() => { setShareButtonState(btn, clipboardIcon, 'Copy'); btn.style.borderColor = ''; }, 2000);
  });

  overlay.querySelector('#share-copy')!.addEventListener('click', async () => {
    const copyBtn = overlay.querySelector('#share-copy') as HTMLButtonElement;
    const input = overlay.querySelector('#share-link') as HTMLInputElement;
    const url = input.value;
    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 512 512" fill="none" stroke="#5DCAA5" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"><polyline points="416 128 192 384 96 288"/></svg>`;
    let copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch { input.select(); input.setSelectionRange(0, url.length); copied = document.execCommand('copy'); }
    if (copied) {
      copyBtn.innerHTML = checkIcon;
      copyBtn.style.borderColor = '#5DCAA5';
      input.style.borderColor = '#5DCAA5';
      trackShare('copy_url');
      setTimeout(() => { copyBtn.innerHTML = copyIcon; copyBtn.style.borderColor = ''; input.style.borderColor = ''; }, 2000);
    }
  });

  overlay.querySelector('#share-save')?.addEventListener('click', () => {
    const img = overlay.querySelector('.share-preview img') as HTMLImageElement;
    const link = document.createElement('a');
    link.href = img?.src || '';
    link.download = `dalalrider-${ticker}-${stats.score}-${selectedVariant}.jpg`;
    link.click();
    trackShare('save_image');
    const btn = overlay.querySelector('#share-save') as HTMLButtonElement;
    setShareButtonState(btn, checkCircleIcon, 'Saved!');
    btn.style.borderColor = '#5DCAA5';
    setTimeout(() => { setShareButtonState(btn, icon('download-outline', 20), 'Save'); btn.style.borderColor = ''; }, 2000);
  });

  overlay.querySelector('#share-native')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#share-native') as HTMLButtonElement;
    try {
      const blob = cardBlobs.get(selectedVariant);
      if (!blob) return;
      const file = new File([blob], `dalalrider-${ticker}-${stats.score}-${selectedVariant}.jpg`, { type: 'image/jpeg' });
      const withFiles = { text: `${shareTextRaw}\n${shareUrl}`, files: [file] };
      if (navigator.canShare?.(withFiles)) { await navigator.share(withFiles); }
      else { await navigator.share({ text: withFiles.text, url: shareUrl }); }
      trackShare('native_share');
    } catch {
      setShareButtonState(btn, icon('share-outline', 20), 'Share');
    }
  });

  if (trackLb && !ipo && !dailyInfo) {
    const lbSection = overlay.querySelector('#track-lb-section') as HTMLElement;
    const playerId = getPlayerId();

    Promise.all([
      checkTrackLeaderboard(ticker, period),
      signLeaderboard(ticker, period, stats.score, stats.time),
    ]).then(([checkResult, hash]) => {
      if (!checkResult || !lbSection || !checkResult.sessionId) return;
      const { top, sessionId } = checkResult;

      const scoreRank = getQualifyRank(top.score, stats.score, true);
      const timeRank = getQualifyRank(top.time, stats.time, false);
      const qualifies = scoreRank !== null || timeRank !== null;

      if (qualifies && hash) {
        const badges: string[] = [];
        if (scoreRank !== null) badges.push(`#${scoreRank} Score`);
        if (timeRank !== null) badges.push(`#${timeRank} Fastest`);
        const isFirst = scoreRank === 1 || timeRank === 1;

        lbSection.innerHTML = `
          <div class="track-lb-qualify">
            ${isFirst ? '<div class="track-lb-crown">👑</div>' : ''}
            <div class="track-lb-qualify-header">${isFirst ? 'World Record!' : 'You made the Top 3!'}</div>
            <div class="track-lb-qualify-details">${badges.map(b => `<span class="tlb-badge">${b}</span>`).join('')}</div>
            <input type="text" class="daily-nick-input" id="track-nick" value="${escapeHTML(getNickname())}" maxlength="20" placeholder="Nickname">
            <button class="track-lb-submit-btn" id="track-lb-submit">Claim your spot</button>
          </div>`;

        if (isFirst) {
          const card = overlay.querySelector('.share-card') as HTMLElement;
          if (card) burstConfetti(card);
        }

        let currentSessionId = sessionId;
        let currentHash = hash;

        overlay.querySelector('#track-lb-submit')!.addEventListener('click', async () => {
          const btn = overlay.querySelector('#track-lb-submit') as HTMLButtonElement;
          const nickInput = overlay.querySelector('#track-nick') as HTMLInputElement;
          const nick = nickInput.value.trim().replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, 20) || getNickname();
          setNickname(nick);
          btn.disabled = true;
          btn.textContent = '...';

          const gameStatsForSubmit: GameStatsForSubmit = { flips: stats.flips, crashes: stats.crashes, maxStreak: stats.maxStreak, time: stats.time, finished: stats.finished };
          let result = await submitTrackLeaderboard(ticker, period, stats.score, stats.time, nick, playerId, gameStatsForSubmit, currentSessionId, currentHash);

          if (!result) {
            const retry = await Promise.all([checkTrackLeaderboard(ticker, period), signLeaderboard(ticker, period, stats.score, stats.time)]);
            if (retry[0] && retry[1]) {
              currentSessionId = retry[0].sessionId;
              currentHash = retry[1];
              result = await submitTrackLeaderboard(ticker, period, stats.score, stats.time, nick, playerId, gameStatsForSubmit, currentSessionId, currentHash);
            }
          }

          if (result?.submitted) {
            trackEvent('leaderboard_submitted', { ticker, period, score: stats.score, time: stats.time, scoreRank, timeRank, is_startup: isTrustMrr });
            lbSection.innerHTML = renderTrackLbResult(result.score, result.time, playerId);

            if (scoreRank === 1 || timeRank === 1) {
              cardInput.worldRecord = true;
              for (const url of cardUrls.values()) URL.revokeObjectURL(url);
              cardUrls.clear();
              cardBlobs.clear();
              showCard(selectedVariant);
              shareTextRaw = buildShareText();
              const xLink = overlay.querySelector('#share-x') as HTMLAnchorElement;
              if (xLink) xLink.href = `https://x.com/intent/tweet?text=${encodeURIComponent(shareTextRaw)}%0A${encodeURIComponent(shareUrl)}`;
            }
          } else if (result && !result.submitted && result.alreadyInBoard) {
            lbSection.innerHTML = `<div class="track-lb-display"><div style="text-align:center;color:var(--text-tertiary);font-size:12px;margin-bottom:8px">Your previous record still stands!</div>${renderTrackLbResult(result.score, result.time, playerId)}</div>`;
          } else if (result && !result.submitted) {
            lbSection.innerHTML = `<div class="track-lb-display"><div style="text-align:center;color:var(--text-tertiary);font-size:12px;margin-bottom:8px">Someone beat you to it!</div>${renderTrackLbResult(result.score, result.time, playerId)}</div>`;
          } else {
            btn.textContent = 'Failed — retry';
            btn.disabled = false;
          }
        });
      } else {
        if (top.score.length || top.time.length) {
          lbSection.innerHTML = `<div class="track-lb-display">${renderTrackLbResult(top.score, top.time, playerId)}</div>`;
        }
      }
    }).catch(() => {});
  }

  overlay.querySelector('#results-retry')!.addEventListener('click', () => {
    trackEvent('game_retry', { ticker, score: stats.score, is_startup: isTrustMrr });
    window.removeEventListener('keydown', onResultsKey);
    overlay.remove();
    document.body.style.overflow = '';
    onRetry();
  });

  overlay.querySelector('#results-new')!.addEventListener('click', () => {
    trackEvent('new_track_clicked', { ticker, score: stats.score, is_startup: isTrustMrr });
    window.removeEventListener('keydown', onResultsKey);
    overlay.remove();
    document.body.style.overflow = '';
    if (isTrustMrr) {
      window.location.hash = '#/startups';
    } else {
      navigate('landing');
    }
  });
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setShareButtonState(btn: HTMLButtonElement, iconHTML: string, label: string) {
  const iconEl = btn.querySelector('.ss-icon');
  const labelEl = btn.querySelector('.ss-label');
  if (iconEl) iconEl.innerHTML = iconHTML;
  if (labelEl) labelEl.textContent = label;
}

function burstConfetti(host: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  wrap.setAttribute('aria-hidden', 'true');
  const colors = ['#EF9F27', '#5DCAA5', '#E24B4A', '#5066FB', '#F4F4F6'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--dx', `${(Math.random() * 2 - 1) * 300}px`);
    p.style.setProperty('--dy', `${180 + Math.random() * 320}px`);
    p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 150}ms`;
    wrap.appendChild(p);
  }
  host.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2000);
}

function renderLeaderboard(entries: DailyLeaderboardEntry[], myPlayerId: string, myRank: number, myEntry: DailyLeaderboardEntry | null): string {
  if (!entries.length) return '';

  const meInTopIdx = entries.findIndex(e => e.playerId === myPlayerId);

  let rows: { entry: DailyLeaderboardEntry; rank: number; isMe: boolean; separator?: boolean }[];

  if (meInTopIdx >= 0 && meInTopIdx < 5) {
    rows = entries.slice(0, 5).map((e, i) => ({ entry: e, rank: i + 1, isMe: e.playerId === myPlayerId }));
  } else if (myEntry) {
    rows = entries.slice(0, 4).map((e, i) => ({ entry: e, rank: i + 1, isMe: false }));
    rows.push({ entry: myEntry, rank: myRank, isMe: true });
  } else {
    rows = entries.slice(0, 5).map((e, i) => ({ entry: e, rank: i + 1, isMe: false }));
  }

  return `<div class="lb-list">${rows.map(r =>
    `<div class="lb-row${r.isMe ? ' lb-me' : ''}"><span class="lb-rank">#${r.rank}</span><span class="lb-name">${escapeHTML(r.entry.nickname)}${countryFlag(r.entry.country)}</span><span class="lb-score">${r.entry.score.toLocaleString()}</span></div>`
  ).join('')}</div>`;
}

function getQualifyRank(entries: TrackLeaderboardEntry[], value: number, higherIsBetter: boolean): number | null {
  if (entries.length < 3) {
    const rank = entries.filter(e => higherIsBetter ? e.score > value : e.time < value).length + 1;
    return rank;
  }
  const rank = entries.filter(e => higherIsBetter ? e.score >= value : e.time <= value).length + 1;
  return rank <= 3 ? rank : null;
}

function renderTrackLbResult(scoreEntries: TrackLeaderboardEntry[], timeEntries: TrackLeaderboardEntry[], myPlayerId: string): string {
  const medals = ['🥇', '🥈', '🥉'];
  const scoreRows = scoreEntries.map((e, i) =>
    `<div class="tlb-row${e.playerId === myPlayerId ? ' tlb-me' : ''}"><span class="tlb-medal">${medals[i]}</span><span class="tlb-name">${escapeHTML(e.nickname)}${countryFlag(e.country)}</span><span class="tlb-val">${e.score.toLocaleString()}</span></div>`
  ).join('');
  const timeRows = timeEntries.map((e, i) =>
    `<div class="tlb-row${e.playerId === myPlayerId ? ' tlb-me' : ''}"><span class="tlb-medal">${medals[i]}</span><span class="tlb-name">${escapeHTML(e.nickname)}${countryFlag(e.country)}</span><span class="tlb-val">${formatTime(e.time)}</span></div>`
  ).join('');
  return `<div class="track-lb-mini"><div class="tlb-columns">
    <div class="tlb-section"><div class="tlb-label">Best Score</div>${scoreRows || '<div class="tlb-empty">—</div>'}</div>
    <div class="tlb-section"><div class="tlb-label">Fastest Time</div>${timeRows || '<div class="tlb-empty">—</div>'}</div>
  </div></div>`;
}
