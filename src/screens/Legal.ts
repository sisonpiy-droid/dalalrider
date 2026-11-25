import { footerHTML } from '../ui/Footer';
import { navHTML } from '../ui/Nav';

const PRIVACY_POLICY = `
<h1>Privacy Policy</h1>
<p><strong>Last updated:</strong> November 2026</p>

<h2>Overview</h2>
<p><strong>DalalRider</strong> is a free, open-source browser game created and maintained by <a href="https://github.com/sisonpiy-droid" target="_blank" rel="noopener">sisonpiy-droid</a> and hosted on GitHub Pages.</p>

<h2>Zero Tracking &amp; Local-First Storage</h2>
<p>DalalRider runs 100% client-side in your browser:</p>
<ul>
  <li><strong>No third-party trackers:</strong> We do not use advertising pixels, cookies, or invasive analytics.</li>
  <li><strong>Local Storage only:</strong> Your personal best scores, ghost replays, rider nickname, and daily challenge results are stored locally in your browser's <code>localStorage</code>.</li>
  <li><strong>No account required:</strong> You never need to sign up or provide personal data to play.</li>
</ul>

<h2>Market Data Sources</h2>
<p>Historical and intraday stock price data for NSE and BSE tickers is fetched from public market data feeds solely for generating game terrain.</p>
`;

const TERMS_OF_USE = `
<h1>Terms of Use</h1>
<p><strong>Last updated:</strong> November 2026</p>

<h2>1. Entertainment Only — Not Financial Advice</h2>
<p>DalalRider is an arcade physics game built for entertainment and educational visualization of market volatility. <strong>Nothing in this application constitutes financial, investment, or trading advice</strong>, nor is it registered with SEBI. Do not make investment decisions based on your motocross backflips.</p>

<h2>2. Open-Source Project</h2>
<p>DalalRider is developed by <a href="https://github.com/sisonpiy-droid" target="_blank" rel="noopener">sisonpiy-droid</a>. All stock ticker symbols and company names belong to their respective listed entities on the National Stock Exchange (NSE) and Bombay Stock Exchange (BSE).</p>

<h2>3. No Warranty</h2>
<p>The game is provided "as is" without warranties of any kind regarding market data accuracy or uninterrupted availability.</p>
`;

const LEGAL_NOTICE = `
<h1>Credits &amp; Legal Notice</h1>
<p><strong>Creator &amp; Developer:</strong> <a href="https://github.com/sisonpiy-droid" target="_blank" rel="noopener">sisonpiy-droid</a></p>
<p><strong>Repository:</strong> <a href="https://github.com/sisonpiy-droid/dalalrider" target="_blank" rel="noopener">github.com/sisonpiy-droid/dalalrider</a></p>
<p><strong>Hosting:</strong> GitHub Pages (GitHub, Inc.)</p>
<p><strong>Tech Stack:</strong> TypeScript, Vite, Matter.js 2D Physics, WebAudio API Synthesizer, HTML5 Canvas.</p>
`;

const PAGES: Record<string, string> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_USE,
  legal: LEGAL_NOTICE,
};

export function renderLegalPage(container: HTMLElement, page: string) {
  const content = PAGES[page] || PAGES.legal;

  container.innerHTML = `
    ${navHTML()}
    <main class="legal-content">
      <a href="#/" class="back-badge">&larr; Home</a>
      ${content}
    </main>
    ${footerHTML()}
  `;
}
