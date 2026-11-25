export function navHTML(right?: string): string {
  return `
    <nav class="nav">
      <a href="#/" class="logo-text" aria-label="DalalRider — home"><span style="color:#FF9933">DALAL</span><span>RIDER</span> <span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(255,153,51,0.14);color:#FF9933;border:1px solid rgba(255,153,51,0.3);margin-left:7px;vertical-align:2px;letter-spacing:0.8px;font-weight:700">NSE · BSE LIVE</span></a>
      ${right !== undefined ? right : `
      <div class="nav-links">
        <a href="#/room" style="color:#FF9933;font-weight:700">🏁 Race Friends</a>
        <a href="#/leaderboard">Leaderboard</a>
        <a href="#/about">How It Works</a>
      </div>`}
    </nav>
  `;
}
