const TAPE_ITEMS = [
  { sym: 'NIFTY 50', price: '₹25,791.25', chg: '+2.23%', up: true, href: '#/NIFTY50' },
  { sym: 'SENSEX', price: '₹83,906.18', chg: '+2.28%', up: true, href: '#/SENSEX' },
  { sym: 'BANKNIFTY', price: '₹63,651.55', chg: '+2.60%', up: true, href: '#/BANKNIFTY' },
  { sym: 'RELIANCE', price: '₹1,373.90', chg: '+0.80%', up: true, href: '#/RELIANCE' },
  { sym: 'ETERNAL', price: '₹373.50', chg: '+2.05%', up: true, href: '#/ETERNAL' },
  { sym: 'HAL', price: '₹4,921.00', chg: '+5.26%', up: true, href: '#/HAL' },
  { sym: 'TATAMOTORS', price: '₹262.50', chg: '+3.94%', up: true, href: '#/TATAMOTORS' },
  { sym: 'TCS', price: '₹2,507.40', chg: '+5.38%', up: true, href: '#/TCS' },
  { sym: 'HDFCBANK', price: '₹844.50', chg: '+4.50%', up: true, href: '#/HDFCBANK' },
  { sym: 'TRENT', price: '₹3,306.80', chg: '+3.66%', up: true, href: '#/TRENT' },
  { sym: 'ADANIENT', price: '₹2,656.40', chg: '-1.04%', up: false, href: '#/ADANIENT' },
  { sym: 'SWIGGY', price: '₹177.90', chg: '-1.43%', up: false, href: '#/SWIGGY?ipo=1' },
  { sym: 'MARUTI', price: '₹14,150.00', chg: '+12.02%', up: true, href: '#/MARUTI' },
];

export function navHTML(right?: string): string {
  const tapeRow = [...TAPE_ITEMS, ...TAPE_ITEMS].map(t => `
    <a href="${t.href}" class="nse-tape-item">
      <span class="nse-tape-sym">${t.sym}</span>
      <span class="nse-tape-price">${t.price}</span>
      <span class="nse-tape-chg ${t.up ? 'up' : 'down'}">${t.up ? '▲' : '▼'} ${t.chg}</span>
    </a>
  `).join('');

  return `
    <div class="nse-tape-wrap" aria-label="Live NSE & BSE Market Ticker">
      <div class="nse-tape-track">${tapeRow}</div>
    </div>
    <nav class="nav">
      <a href="#/" class="logo-text" aria-label="DalalRider — home" style="display:inline-flex;align-items:center;gap:8px">
        <img src="./logo.svg" alt="" style="width:26px;height:26px;border-radius:6px">
        <span><span style="color:#FF8C1A">DALAL</span><span style="color:#F8FAFC">RIDER</span></span>
        <span style="font-size:9px;padding:2px 7px;border-radius:999px;background:rgba(0,230,118,0.14);color:#00E676;border:1px solid rgba(0,230,118,0.35);letter-spacing:0.8px;font-weight:800">● NSE LIVE</span>
      </a>
      ${right !== undefined ? right : `
      <div class="nav-links">
        <a href="#/room" class="nav-mp-pill">🏁 Multiplayer Rooms</a>
        <a href="#/leaderboard">Podium</a>
        <a href="#/about">Engine</a>
        <a href="https://github.com/sisonpiy-droid/dalalrider" target="_blank" rel="noopener">GitHub ↗</a>
      </div>`}
    </nav>
  `;
}
