import { footerHTML } from '../ui/Footer';
import { navHTML } from '../ui/Nav';
import { trackEvent } from '../analytics';
import { PROXY_URL } from '../data/TickerData';

const FEATURES = [
  { key: 'fno_expiry', label: 'Zero-DTE BankNifty & Nifty Expiry Intraday Tracks' },
  { key: 'sme_ipos', label: 'BSE SME & Mainboard IPO Listing-Day Tracks' },
  { key: 'harshad_1992', label: '1992 Harshad Mehta Bull Run & Ketan Parekh 2001 Archive' },
  { key: 'sector_indices', label: 'Nifty PSU Bank, Nifty Defence, Nifty IT & Smallcap 250' },
  { key: 'cosmetics', label: 'Custom Dalal Street Bike Skins (Big Bull, RJ, Operator)' },
  { key: 'multiplayer', label: 'Live Multiplayer Ghost Racing with Friends' },
];

export function renderEarlyAccess(container: HTMLElement) {
  container.innerHTML = `
    ${navHTML()}
    <main class="ea-wrapper">
      <div class="ea-screen ea-screen--active" id="ea-form">
        <a href="#/" class="back-badge"><ion-icon name="arrow-back-outline"></ion-icon> Home</a>
        <div class="ea-inner">
          <h1 class="ea-title">Next on DalalRider Roadmap.</h1>
          <p class="ea-subtitle">BankNifty Expiry tracks, 1992 Harshad Mehta archives, SME IPOs & custom bike skins.</p>
          <div class="ea-counter" id="ea-counter"></div>
          <form id="ea-email-form" autocomplete="off">
            <input id="ea-email" type="email" class="ea-input" placeholder="you@example.com" required maxlength="200" />
            <button type="submit" class="ea-submit" disabled>Get early access</button>
          </form>
          <p class="ea-hint">Drop your email and we'll ping you first.</p>
        </div>
      </div>

      <div class="ea-screen" id="ea-survey">
        <div class="ea-inner">
          <h1 class="ea-title">What do you want most?</h1>
          <p class="ea-subtitle">Select everything that interests you.</p>
          <div class="ea-choices" id="ea-choices">
            ${FEATURES.map(f => `<button class="ea-choice" data-key="${f.key}">${f.label}</button>`).join('')}
            <button class="ea-choice" id="ea-other-btn" data-key="other">Other</button>
          </div>
          <div class="ea-other-wrap" id="ea-other-wrap" style="display:none">
            <textarea id="ea-other-input" class="ea-textarea" placeholder="Tell us what you want..." maxlength="200" rows="3"></textarea>
          </div>
          <button class="ea-submit ea-submit-survey" id="ea-survey-submit">Done</button>
        </div>
      </div>

      <div class="ea-screen" id="ea-thanks">
        <div class="ea-inner">
          <div class="ea-check">&#10003;</div>
          <h1 class="ea-title">You're in.</h1>
          <p class="ea-subtitle">We'll ping you when it's ready.</p>
          <a class="ea-submit" href="#/">Back to riding</a>
        </div>
      </div>
    </main>
    ${footerHTML()}
  `;

  const emailForm = document.getElementById('ea-email-form') as HTMLFormElement;
  const emailInput = document.getElementById('ea-email') as HTMLInputElement;
  const submitBtn = emailForm.querySelector('button[type="submit"]') as HTMLButtonElement;
  const screenForm = document.getElementById('ea-form')!;
  const screenSurvey = document.getElementById('ea-survey')!;
  const screenThanks = document.getElementById('ea-thanks')!;
  const counterEl = document.getElementById('ea-counter')!;

  emailInput.addEventListener('input', () => {
    submitBtn.disabled = !(emailInput.value.trim() && emailInput.validity.valid);
  });

  fetch(`${PROXY_URL}/stats/early-access-count`).then(r => r.json()).then(d => {
    if (d.count > 0) counterEl.textContent = `${d.count.toLocaleString()} riders interested`;
  }).catch(() => {});

  let userEmail = '';

  emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    userEmail = emailInput.value.trim();
    if (!userEmail) return;

    trackEvent('early_access_signup', { email: userEmail });

    fetch(`${PROXY_URL}/stats/early-access-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail }),
    }).catch(() => {});

    screenForm.classList.remove('ea-screen--active');
    screenSurvey.classList.add('ea-screen--active');
  });

  const selected = new Set<string>();
  const otherWrap = document.getElementById('ea-other-wrap')!;
  const otherInput = document.getElementById('ea-other-input') as HTMLTextAreaElement;
  let otherActive = false;

  document.getElementById('ea-choices')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.ea-choice') as HTMLElement;
    if (!btn) return;
    const key = btn.dataset.key!;
    if (key === 'other') {
      otherActive = !otherActive;
      btn.classList.toggle('active', otherActive);
      otherWrap.style.display = otherActive ? 'block' : 'none';
      if (otherActive) otherInput.focus();
      return;
    }
    if (selected.has(key)) { selected.delete(key); btn.classList.remove('active'); }
    else { selected.add(key); btn.classList.add('active'); }
  });

  document.getElementById('ea-survey-submit')!.addEventListener('click', () => {
    const choices = [...selected];
    const other = otherActive ? otherInput.value.trim().slice(0, 200) : '';
    if (other) choices.push(`other:${other}`);

    trackEvent('early_access_survey', { email: userEmail, choices });

    screenSurvey.classList.remove('ea-screen--active');
    screenThanks.classList.add('ea-screen--active');
  });
}
