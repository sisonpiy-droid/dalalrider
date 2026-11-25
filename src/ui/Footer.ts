import { icon } from './icons';

export function footerHTML(): string {
  return `
    <footer class="footer">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="#/" class="logo-text" aria-label="DalalRider — home"><span style="color:#FF9933">DALAL</span><span>RIDER</span></a>
          <p>An open-source Indian stock market arcade game by <a href="https://github.com/sisonpiy-droid" target="_blank" rel="noopener" style="color:var(--text-primary);text-decoration:underline">sisonpiy-droid</a>. Real NSE &amp; BSE price action turned into playable 2D motocross terrain.</p>
          <div class="footer-socials">
            <a href="https://github.com/sisonpiy-droid/dalalrider" target="_blank" rel="noopener" class="footer-social" aria-label="GitHub Repository" title="Star on GitHub">${icon('code-slash', 15) || 'GH'}</a>
          </div>
        </div>
        <nav class="footer-col" aria-label="Markets">
          <div class="footer-col-title">Dalal Street</div>
          <ul>
            <li><a href="#/">NSE &amp; BSE Blue-Chips</a></li>
            <li><a href="#/startups">Indian Unicorns &amp; Tech</a></li>
            <li><a href="#/leaderboard">Daily Nifty Challenge</a></li>
            <li><a href="#/early-access">F&amp;O &amp; Sector Indices</a></li>
          </ul>
        </nav>
        <nav class="footer-col" aria-label="Project">
          <div class="footer-col-title">Project</div>
          <ul>
            <li><a href="#/about">Architecture &amp; Physics</a></li>
            <li><a href="#/contact">Feedback &amp; Feature Requests</a></li>
            <li><a href="#/privacy">Privacy</a></li>
            <li><a href="#/terms">Terms</a></li>
            <li><a href="#/legal">Credits &amp; License</a></li>
          </ul>
        </nav>
      </div>
      <div class="footer-note">Designed &amp; Engineered by sisonpiy-droid · Built with TypeScript &amp; Matter.js · Not SEBI-registered investment advice</div>
    </footer>
  `;
}
