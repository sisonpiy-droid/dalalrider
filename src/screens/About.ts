import { footerHTML } from '../ui/Footer';
import { navHTML } from '../ui/Nav';

export function renderAbout(container: HTMLElement) {
  container.innerHTML = `
    ${navHTML()}
    <main class="legal-content">
      <a href="#/" class="back-badge">&larr; Back to Dalal Street</a>
      <h1>About DalalRider</h1>
      <p><strong>DalalRider</strong> is an original open-source browser game created by <a href="https://github.com/sisonpiy-droid" target="_blank" rel="noopener">sisonpiy-droid</a> that transforms live Indian stock market charts (NSE &amp; BSE) into 2D physics motocross tracks. Pick any Dalal Street ticker &mdash; Reliance, Eternal (Zomato), Tata Motors, HAL, Adani Enterprises, Yes Bank, or RCom &mdash; and ride its real historical and intraday price action on a dirt bike.</p>

      <h2>How the Physics &amp; Terrain Engine Works</h2>
      <p>Real OHLCV market candles from NSE and BSE are normalized into continuous 2D collision bodies using <strong>Matter.js</strong>. Bull rallies become steep launch ramps, low-volatility blue-chips create fast flow sections, and legendary lower-circuit wealth destroyers become vertical cliffs. The custom bike rig models dual-wheel spring-damper suspension, angular torque, and ragdoll physics on wipeout.</p>

      <h2>Stunts, Rupees &amp; Multipliers</h2>
      <p>Pull off aerial stunts &mdash; backflips, frontflips, supermans, no-handers, dead sailors &mdash; or ground tricks like wheelies, stoppies, and speed demons. Chain clean landings without crashing to build your streak multiplier up to <strong>&times;5</strong>. Collect <strong>₹</strong> rupee coins along the price curve and fire <strong>NITRO</strong> to launch into orbit.</p>

      <h2>Game Modes</h2>
      <ul>
        <li><strong>Live 1D Intraday &amp; Multi-Year Tracks:</strong> Switch between <code>LIVE 1D</code> (5-minute NSE candles), <code>1M</code>, <code>3M</code>, <code>6M</code>, <code>1Y</code>, and <code>ALL</code> on 75+ preloaded Indian stocks and 215+ searchable NSE symbols.</li>
        <li><strong>Indian Unicorns &amp; New-Age Tech:</strong> Switch to the <strong>UNICORNS</strong> tab to ride India's top consumer-tech and fintech giants (Zomato/Blinkit, Swiggy, Paytm, Nykaa, Ola Electric, Policybazaar, Delhivery, Angel One, Jio Financial).</li>
        <li><strong>Legendary Dalal Street Crashes:</strong> Survive historic wealth-destruction tracks including RCom (-99.8%), Jet Airways (-95%), Unitech (-99.9%), HDIL (-99.8%), Educomp, Future Retail, and Yes Bank.</li>
        <li><strong>Daily Nifty Challenge:</strong> Compete on a rotating daily NSE track and export custom P&amp;L cards, Dalal Terminal screenshots, or SEBI-style Crash Incident Reports.</li>
      </ul>

      <h2>Controls</h2>
      <ul>
        <li><strong>Desktop:</strong> <code>&uarr;</code> Gas &middot; <code>&larr;</code> / <code>&rarr;</code> Wheelie / Nose Dive (Backflip / Frontflip in air) &middot; <code>Space</code> Jump &middot; <code>Shift / N</code> Nitro Boost &middot; <code>R</code> Checkpoint Reset &middot; <code>M</code> Mute Audio</li>
        <li><strong>Mobile:</strong> Hold right side for Gas, tap top-left / bottom-left to tilt, tap to Jump.</li>
      </ul>

      <h2>Creator &amp; Open Source</h2>
      <p>Designed and built by <a href="https://github.com/sisonpiy-droid" target="_blank" rel="noopener">sisonpiy-droid</a>. View the source code or contribute on <a href="https://github.com/sisonpiy-droid/dalalrider" target="_blank" rel="noopener">GitHub</a>.</p>
    </main>
    ${footerHTML()}
  `;
}
