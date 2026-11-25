import { footerHTML } from '../ui/Footer';
import { navHTML } from '../ui/Nav';
import { trackEvent } from '../analytics';

export function renderContact(container: HTMLElement) {
  container.innerHTML = `
    ${navHTML()}
    <main class="ct-wrapper">
      <div class="ct-screen ct-screen--active" id="screen-form">
        <a href="#/" class="back-badge">&larr; Home</a>
        <div class="ct-inner">
          <h1 class="ct-title">Get in touch</h1>
          <p class="ct-subtitle">
            Interested in a partnership or advertising opportunity?<br>
            We usually reply within 48 hours.
          </p>

          <form id="contact-form" autocomplete="off">
            <label class="ct-label" for="ct-email">Your email</label>
            <input id="ct-email" type="email" class="ct-input" placeholder="you@example.com" required maxlength="200" />

            <label class="ct-label" for="ct-category">Subject</label>
            <select id="ct-category" class="ct-input ct-select" required>
              <option value="" disabled selected>Select a subject…</option>
              <option value="partnership">Partnership</option>
              <option value="advertising">Advertising</option>
              <option value="data-removal">Data removal request</option>
              <option value="other">Other</option>
            </select>

            <label class="ct-label" for="ct-message">Message</label>
            <textarea id="ct-message" class="ct-textarea" placeholder="Tell us about your project…" required maxlength="2000" rows="5"></textarea>

            <button type="submit" class="ct-submit" disabled>Send message</button>
          </form>
        </div>
      </div>

      <div class="ct-screen" id="screen-thanks">
        <div class="ct-inner">
          <div class="ct-check-circle">&#10003;</div>
          <h1 class="ct-title">Message sent!</h1>
          <p class="ct-subtitle">Thanks for reaching out. We'll get back to you soon.</p>
          <a class="ct-submit" href="#/">Back to home</a>
        </div>
      </div>
    </main>
    ${footerHTML()}
  `;

  const form = document.getElementById('contact-form') as HTMLFormElement;
  const emailInput = document.getElementById('ct-email') as HTMLInputElement;
  const categorySelect = document.getElementById('ct-category') as HTMLSelectElement;
  const messageInput = document.getElementById('ct-message') as HTMLTextAreaElement;
  const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  const screenForm = document.getElementById('screen-form')!;
  const screenThanks = document.getElementById('screen-thanks')!;

  function updateSubmitState() {
    const emailOk = emailInput.value.trim() && emailInput.validity.valid;
    const catOk = categorySelect.value !== '';
    const msgOk = messageInput.value.trim().length > 0;
    submitBtn.disabled = !(emailOk && catOk && msgOk);
  }

  emailInput.addEventListener('input', updateSubmitState);
  categorySelect.addEventListener('change', updateSubmitState);
  messageInput.addEventListener('input', updateSubmitState);

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const category = categorySelect.value;
    const message = messageInput.value.trim().slice(0, 2000);
    if (!email || !category || !message) return;

    trackEvent('contact_form_submitted', { email, category, message });

    screenForm.classList.remove('ct-screen--active');
    screenThanks.classList.add('ct-screen--active');
  });
}
