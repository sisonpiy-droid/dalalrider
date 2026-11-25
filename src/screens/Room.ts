import { mp, RoomState } from '../multiplayer';
import { TickerInfo, getNickname, setNickname, filterByPeriod } from '../data/TickerData';
import { navHTML } from '../ui/Nav';
import { footerHTML } from '../ui/Footer';
import { navigate } from '../ui/Router';

const ROOM_TRACKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries' },
  { symbol: 'ETERNAL', name: 'Eternal (Zomato)' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises' },
  { symbol: 'HAL', name: 'Hindustan Aeronautics (HAL)' },
  { symbol: 'TRENT', name: 'Trent Ltd. (Zudio)' },
  { symbol: 'INFY', name: 'Infosys' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank' },
  { symbol: 'NIFTY50', name: 'NIFTY 50 Index' },
  { symbol: 'TCS', name: 'Tata Consultancy Services' },
  { symbol: 'SBIN', name: 'State Bank of India' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki' },
  { symbol: 'MAZDOCK', name: 'Mazagon Dock' },
  { symbol: 'BSE', name: 'BSE India' },
  { symbol: 'SWIGGY', name: 'Swiggy' },
  { symbol: 'OLAELEC', name: 'Ola Electric' },
  { symbol: 'PAYTM', name: 'Paytm (One97)' },
  { symbol: 'YESBANK', name: 'Yes Bank' },
  { symbol: 'SUZLON', name: 'Suzlon Energy' },
  { symbol: 'RCOM', name: 'Reliance Communications (Crash)' },
  { symbol: 'JETAIRWAYS', name: 'Jet Airways (Crash)' },
];

const ROOM_PERIODS = [
  { key: '1d', label: 'LIVE 1D (Intraday 5m)' },
  { key: '1m', label: '1 Month' },
  { key: '3m', label: '3 Months' },
  { key: '6m', label: '6 Months' },
  { key: '1y', label: '1 Year' },
  { key: 'all', label: '5 Years (ALL)' },
];

export async function renderRoom(
  container: HTMLElement,
  allTickers: Record<string, TickerInfo>,
  roomCodeFromRoute?: string,
  initialTicker?: string,
  initialPeriod?: string,
  onStartMultiplayerRace?: (ticker: TickerInfo, period: string, smooth: boolean) => void,
) {
  let unsub: (() => void) | null = null;
  let launchedStartTime = 0;

  const observer = new MutationObserver(() => {
    if (!container.querySelector('.mp-room-wrap')) {
      unsub?.();
      observer.disconnect();
    }
  });
  observer.observe(container, { childList: true });

  // If route has a code and we aren't already in that room, join it automatically
  if (roomCodeFromRoute && (!mp.state || mp.state.code !== roomCodeFromRoute.toUpperCase())) {
    container.innerHTML = `
      ${navHTML()}
      <main class="content mp-room-wrap" style="max-width:640px;margin:0 auto;padding:60px 20px;text-align:center">
        <div style="font-size:14px;color:#FF9933;font-family:var(--font-display);letter-spacing:1.5px;margin-bottom:10px">MULTIPLAYER RACE ROOM</div>
        <h1 style="font-size:28px;margin-bottom:12px">Joining Room <span style="color:#FF9933;font-family:var(--font-display)">${roomCodeFromRoute.toUpperCase()}</span>...</h1>
        <p style="color:var(--text-secondary);font-size:14px">Connecting to host via P2P WebRTC...</p>
      </main>
      ${footerHTML()}
    `;
    const ok = await mp.joinRoom(roomCodeFromRoute);
    if (!ok || !mp.state) {
      renderJoinOrCreateHub(container, allTickers, initialTicker, initialPeriod, onStartMultiplayerRace, `Could not find active room "${roomCodeFromRoute.toUpperCase()}". Check the code or create a new room.`);
      return;
    }
  }

  // If no room active and no code in route, show the Create / Join Hub
  if (!mp.state) {
    renderJoinOrCreateHub(container, allTickers, initialTicker, initialPeriod, onStartMultiplayerRace);
    return;
  }

  function renderLobby(state: RoomState) {
    if (state.status === 'racing' && state.startTime !== launchedStartTime) {
      launchedStartTime = state.startTime;
      const t = allTickers[state.ticker] || allTickers['RELIANCE'];
      if (t && onStartMultiplayerRace) {
        unsub?.();
        onStartMultiplayerRace(t, state.period, state.smooth);
        return;
      }
    }

    const isHost = state.hostId === mp.myId;
    const players = Object.values(state.players);
    const inviteUrl = `${window.location.origin}${window.location.pathname}#/room/${state.code}`;
    const selectedTickerObj = allTickers[state.ticker] || allTickers['RELIANCE'];
    const pts = selectedTickerObj ? filterByPeriod(selectedTickerObj.dataPoints, state.period, selectedTickerObj) : [];

    container.innerHTML = `
      ${navHTML()}
      <main class="content mp-room-wrap" style="max-width:680px;margin:0 auto;padding:24px 20px;width:100%">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="#/">Home</a><span class="bc-sep">/</span><span aria-current="page">Multiplayer Room ${state.code}</span>
        </nav>

        <div style="background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:14px;padding:24px;margin-top:14px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;border-bottom:1px solid var(--border-default);padding-bottom:20px">
            <div>
              <div style="font-size:11px;font-family:var(--font-display);color:#FF9933;letter-spacing:1.5px;font-weight:700;margin-bottom:6px">🏁 LIVE MULTIPLAYER LOBBY · FIRST TO FINISH WINS</div>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:34px;font-weight:800;font-family:var(--font-display);letter-spacing:3px;color:var(--text-primary)">${state.code}</span>
                <button id="mp-copy-code" style="background:var(--bg-tertiary);border:1px solid var(--border-default);color:var(--text-primary);padding:6px 12px;border-radius:6px;font-size:12px;font-family:var(--font-display);cursor:pointer">Copy Code</button>
              </div>
            </div>
            <div style="flex:1;min-width:240px">
              <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Share invite link with friends:</div>
              <div style="display:flex;gap:8px">
                <input type="text" readonly value="${inviteUrl}" id="mp-invite-input" style="flex:1;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-secondary);padding:8px 10px;border-radius:6px;font-size:12px;font-family:var(--font-display)">
                <button id="mp-copy-link" style="background:#FF9933;color:#0A0C10;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Copy Link</button>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:20px">
            <div>
              <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">
                Riders in Room (${players.length})
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${players.map(p => `
                  <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-primary);border:1px solid ${p.id === mp.myId ? p.color : 'var(--border-default)'};padding:10px 14px;border-radius:8px">
                    <div style="display:flex;align-items:center;gap:10px">
                      <span style="width:12px;height:12px;border-radius:50%;background:${p.color};display:inline-block;box-shadow:0 0 8px ${p.color}"></span>
                      <span style="font-weight:700;font-size:14px;color:var(--text-primary)">${p.nickname}</span>
                      ${p.id === mp.myId ? '<span style="font-size:10px;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;color:var(--text-secondary)">YOU</span>' : ''}
                    </div>
                    <span style="font-size:11px;font-family:var(--font-display);color:${p.isHost ? '#FF9933' : '#5DCAA5'}">${p.isHost ? '👑 HOST' : '✓ READY'}</span>
                  </div>
                `).join('')}
              </div>

              <div style="margin-top:16px">
                <label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:6px">Your Rider Nickname</label>
                <div style="display:flex;gap:8px">
                  <input type="text" id="mp-nick-input" value="${getNickname()}" maxlength="18" style="flex:1;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);padding:8px 10px;border-radius:6px;font-size:13px">
                  <button id="mp-nick-save" style="background:var(--bg-tertiary);border:1px solid var(--border-default);color:var(--text-primary);padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer">Update</button>
                </div>
              </div>
            </div>

            <div style="background:var(--bg-primary);border:1px solid var(--border-default);border-radius:10px;padding:16px">
              <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">
                Track Settings ${isHost ? '(Host Controls)' : '(Selected by Host)'}
              </div>

              <label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">NSE / BSE Stock Track</label>
              <select id="mp-track-select" ${!isHost ? 'disabled' : ''} style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-default);color:var(--text-primary);padding:9px 10px;border-radius:6px;font-size:13px;margin-bottom:12px;font-family:var(--font-display)">
                ${ROOM_TRACKS.map(t => `<option value="${t.symbol}" ${t.symbol === state.ticker ? 'selected' : ''}>${t.symbol} — ${t.name}</option>`).join('')}
              </select>

              <label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">Chart Timeframe</label>
              <select id="mp-period-select" ${!isHost ? 'disabled' : ''} style="width:100%;background:var(--bg-secondary);border:1px solid var(--border-default);color:var(--text-primary);padding:9px 10px;border-radius:6px;font-size:13px;margin-bottom:12px;font-family:var(--font-display)">
                ${ROOM_PERIODS.map(p => `<option value="${p.key}" ${p.key === state.period ? 'selected' : ''}>${p.label}</option>`).join('')}
              </select>

              <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);cursor:${isHost ? 'pointer' : 'default'};margin-bottom:14px">
                <input type="checkbox" id="mp-smooth-toggle" ${state.smooth ? 'checked' : ''} ${!isHost ? 'disabled' : ''}>
                Smooth terrain curves
              </label>

              <div style="font-size:12px;color:var(--text-tertiary);border-top:1px solid var(--border-default);padding-top:10px;display:flex;justify-content:space-between">
                <span>Track Length: <strong style="color:var(--text-primary)">${pts.length} candles</strong></span>
                <span>Quote: <strong style="color:#5DCAA5">₹${(selectedTickerObj?.currentPrice || pts[pts.length - 1]?.close || 0).toLocaleString('en-IN')}</strong></span>
              </div>
            </div>
          </div>

          <div style="margin-top:24px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-top:1px solid var(--border-default);padding-top:20px">
            <button id="mp-leave-btn" style="background:transparent;border:1px solid var(--border-default);color:var(--text-secondary);padding:12px 18px;border-radius:8px;font-size:13px;cursor:pointer">Leave Room</button>
            ${isHost
              ? `<button id="mp-start-btn" class="cta" style="margin:0;padding:13px 32px;font-size:15px;background:#FF9933;color:#0A0C10;font-weight:800">🏁 Start Race Now (${players.length} Rider${players.length > 1 ? 's' : ''})</button>`
              : `<div style="font-size:14px;color:#FF9933;font-family:var(--font-display);font-weight:600">⏳ Waiting for Host to start the race...</div>`
            }
          </div>
        </div>
      </main>
      ${footerHTML()}
    `;

    container.querySelector('#mp-copy-code')?.addEventListener('click', (e) => {
      navigator.clipboard?.writeText(state.code);
      (e.target as HTMLElement).textContent = 'Copied!';
    });

    container.querySelector('#mp-copy-link')?.addEventListener('click', (e) => {
      navigator.clipboard?.writeText(inviteUrl);
      (e.target as HTMLElement).textContent = 'Copied!';
    });

    container.querySelector('#mp-nick-save')?.addEventListener('click', () => {
      const val = (container.querySelector('#mp-nick-input') as HTMLInputElement).value.trim();
      if (val) {
        setNickname(val);
        mp.updateMyNickname(val);
      }
    });

    if (isHost) {
      const updateTrack = () => {
        const sym = (container.querySelector('#mp-track-select') as HTMLSelectElement).value;
        const per = (container.querySelector('#mp-period-select') as HTMLSelectElement).value;
        const sm = (container.querySelector('#mp-smooth-toggle') as HTMLInputElement).checked;
        mp.setRoomTrack(sym, per, sm);
      };
      container.querySelector('#mp-track-select')?.addEventListener('change', updateTrack);
      container.querySelector('#mp-period-select')?.addEventListener('change', updateTrack);
      container.querySelector('#mp-smooth-toggle')?.addEventListener('change', updateTrack);

      container.querySelector('#mp-start-btn')?.addEventListener('click', () => {
        mp.startRace();
      });
    }

    container.querySelector('#mp-leave-btn')?.addEventListener('click', () => {
      unsub?.();
      mp.disconnect();
      navigate('landing');
    });
  }

  unsub = mp.subscribe(renderLobby);
}

function renderJoinOrCreateHub(
  container: HTMLElement,
  allTickers: Record<string, TickerInfo>,
  initialTicker = 'RELIANCE',
  initialPeriod = '1y',
  onStartMultiplayerRace?: (ticker: TickerInfo, period: string, smooth: boolean) => void,
  errorMsg = '',
) {
  container.innerHTML = `
    ${navHTML()}
    <main class="content mp-room-wrap" style="max-width:620px;margin:0 auto;padding:32px 20px;width:100%">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="#/">Home</a><span class="bc-sep">/</span><span aria-current="page">Race with Friends</span>
      </nav>

      <div style="text-align:center;margin:20px 0 28px">
        <div style="font-size:11px;font-family:var(--font-display);color:#FF9933;letter-spacing:1.5px;font-weight:700;margin-bottom:8px">⚡ REAL-TIME P2P MULTIPLAYER</div>
        <h1 style="font-size:32px;font-weight:800;margin-bottom:8px">Race Dalal Street with Friends</h1>
        <p style="color:var(--text-secondary);font-size:14px;max-width:460px;margin:0 auto">Create a private room or enter a friend's 5-letter room code. Everyone launches together — <strong>whoever crosses the finish line first wins!</strong></p>
      </div>

      ${errorMsg ? `<div style="background:rgba(226,75,74,0.15);border:1px solid #E24B4A;color:#E24B4A;padding:12px 16px;border-radius:8px;margin-bottom:18px;font-size:13px;text-align:center">${errorMsg}</div>` : ''}

      <div style="background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:12px;padding:18px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <label style="font-size:13px;font-weight:600;color:var(--text-secondary)">Your Rider Name:</label>
        <input type="text" id="hub-nick" value="${getNickname()}" maxlength="18" style="flex:1;min-width:180px;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);padding:9px 12px;border-radius:6px;font-size:14px;font-family:var(--font-display)">
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px">
        <div style="background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:12px;padding:22px;display:flex;flex-direction:column;justify-content:space-between">
          <div>
            <div style="font-size:11px;font-family:var(--font-display);color:#FF9933;font-weight:700;margin-bottom:6px">HOST A RACE</div>
            <h2 style="font-size:20px;margin-bottom:8px">Create a Room</h2>
            <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Pick any NSE/BSE stock chart, get a 5-letter room code &amp; invite link, and start the countdown when your friends join.</p>
          </div>
          <button id="hub-create-btn" class="cta" style="width:100%;margin:0;background:#FF9933;color:#0A0C10;font-weight:800">Create Room →</button>
        </div>

        <div style="background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:12px;padding:22px;display:flex;flex-direction:column;justify-content:space-between">
          <div>
            <div style="font-size:11px;font-family:var(--font-display);color:#5DCAA5;font-weight:700;margin-bottom:6px">HAVE A CODE?</div>
            <h2 style="font-size:20px;margin-bottom:8px">Join Friend's Room</h2>
            <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">Enter the 5-character room code shared by your friend:</p>
            <input type="text" id="hub-code-input" placeholder="e.g. BULL9" maxlength="8" style="width:100%;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);padding:11px 12px;border-radius:8px;font-size:18px;font-weight:800;font-family:var(--font-display);text-transform:uppercase;letter-spacing:3px;text-align:center;margin-bottom:12px">
          </div>
          <button id="hub-join-btn" class="cta" style="width:100%;margin:0">Join Room →</button>
        </div>
      </div>
    </main>
    ${footerHTML()}
  `;

  const saveNick = () => {
    const val = (container.querySelector('#hub-nick') as HTMLInputElement)?.value.trim();
    if (val) setNickname(val);
  };

  container.querySelector('#hub-create-btn')?.addEventListener('click', async (e) => {
    saveNick();
    const btn = e.target as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Creating Room...';
    const code = await mp.createRoom(initialTicker, initialPeriod, false);
    window.location.hash = `#/room/${code}`;
  });

  const doJoin = async () => {
    saveNick();
    const input = container.querySelector('#hub-code-input') as HTMLInputElement;
    const code = input.value.trim().toUpperCase();
    if (!code) { input.focus(); return; }
    const btn = container.querySelector('#hub-join-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Joining...';
    window.location.hash = `#/room/${code}`;
  };

  container.querySelector('#hub-join-btn')?.addEventListener('click', doJoin);
  container.querySelector('#hub-code-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') doJoin();
  });
}
