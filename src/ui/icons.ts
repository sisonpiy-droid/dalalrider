
const S = (paths: string, w = 32) =>
  `<g fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;

const ICONS: Record<string, { vb: string; body: string }> = {
  'arrow-back-outline': { vb: '0 0 512 512', body: S('<path d="M244 400L100 256l144-144"/><path d="M120 256h292"/>', 48) },
  'checkmark-outline': { vb: '0 0 512 512', body: S('<path d="M416 128L192 384l-96-96"/>', 44) },
  'download-outline': { vb: '0 0 512 512', body: S('<path d="M336 176h40a40 40 0 0140 40v208a40 40 0 01-40 40H136a40 40 0 01-40-40V216a40 40 0 0140-40h40"/><path d="M176 272l80 80 80-80"/><path d="M256 48v304"/>') },
  'share-outline': { vb: '0 0 512 512', body: S('<path d="M336 192h40a40 40 0 0140 40v192a40 40 0 01-40 40H136a40 40 0 01-40-40V232a40 40 0 0140-40h40"/><path d="M336 128l-80-80-80 80"/><path d="M256 48v288"/>') },
  'podium-outline': { vb: '0 0 512 512', body: S('<path d="M32 192h128v256H32z"/><path d="M192 128h128v320H192z"/><path d="M352 224h128v224H352z"/>') },
  'copy-outline': { vb: '0 0 512 512', body: S('<rect x="128" y="128" width="336" height="336" rx="57"/><path d="M383.5 128l.5-24a56.16 56.16 0 00-56-56H112a64.19 64.19 0 00-64 64v216a56.16 56.16 0 0056 56h24"/>') },
  'timer-outline': { vb: '0 0 512 512', body: S('<circle cx="256" cy="272" r="192"/><path d="M256 176v96h96"/><path d="M200 32h112"/>') },
  'flag': { vb: '0 0 512 512', body: '<path fill="currentColor" d="M80 480a16 16 0 01-16-16V68a16 16 0 019-14.4C89 47 117 32 176 32c37 0 70 11 99 21s57 19 93 19a222 222 0 0068-10 16 16 0 0120 15v224a16 16 0 01-11 15 262 262 0 01-77 11c-42 0-73-11-101-21s-56-20-91-20c-40 0-64 8-80 15v163a16 16 0 01-16 16z"/>' },
  skull: { vb: '0 0 512 512', body: '<path fill="currentColor" fill-rule="evenodd" d="M256 48C141 48 48 133 48 238c0 55 26 99 68 128v66a16 16 0 0016 16h36v-44h44v44h88v-44h44v44h36a16 16 0 0016-16v-66c42-29 68-73 68-128C464 133 371 48 256 48zm-88 232a40 40 0 1140-40 40 40 0 01-40 40zm176 0a40 40 0 1140-40 40 40 0 01-40 40z"/>' },
  ribbon: { vb: '0 0 512 512', body: '<path fill="currentColor" fill-rule="evenodd" d="M256 32a128 128 0 00-58 242l-52 190a12 12 0 0018 13l86-54a12 12 0 0112 0l86 54a12 12 0 0018-13l-52-190A128 128 0 00256 32zm0 76a52 52 0 11-52 52 52 52 0 0152-52z"/>' },
  crown: { vb: '0 0 512 512', body: '<path fill="currentColor" d="M64 400l-24-220 120 84 96-152 96 152 120-84-24 220zm0 32h384v48H64z"/>' },
  pause: { vb: '0 0 512 512', body: '<rect fill="currentColor" x="144" y="96" width="80" height="320" rx="24"/><rect fill="currentColor" x="288" y="96" width="80" height="320" rx="24"/>' },
  'volume-high': { vb: '0 0 512 512', body: '<path fill="currentColor" d="M232 96L136 176H64a16 16 0 00-16 16v128a16 16 0 0016 16h72l96 80a16 16 0 0024-14V110a16 16 0 00-24-14z"/>' + S('<path d="M320 320c9.74-19.41 15-40.81 15-64s-5.26-44.59-15-64"/><path d="M368 368c19.48-34 30.67-70.77 30.67-112S387.48 178 368 144"/><path d="M416 416c27.98-48.63 43.89-100.83 43.89-160S443.98 144.63 416 96"/>') },
  'volume-mute': { vb: '0 0 512 512', body: '<path fill="currentColor" d="M232 96L136 176H64a16 16 0 00-16 16v128a16 16 0 0016 16h72l96 80a16 16 0 0024-14V110a16 16 0 00-24-14z"/>' + S('<path d="M352 208l96 96"/><path d="M448 208l-96 96"/>') },
  'rocket-outline': { vb: '0 0 512 512', body: S('<path d="M456 56c-64-16-160 24-224 88l-56 56-80 16-48 48 84 28 92 92 28 84 48-48 16-80 56-56c64-64 104-160 88-224z"/><path d="M120 392c-24 24-32 80-32 80s56-8 80-32"/>') + '<circle fill="currentColor" cx="328" cy="184" r="26"/>' },
  'logo-twitter': { vb: '0 0 24 24', body: '<path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>' },
  'logo-linkedin': { vb: '0 0 512 512', body: '<path fill="currentColor" d="M32 160h80v304H32z"/><circle fill="currentColor" cx="72" cy="88" r="44"/><path fill="currentColor" d="M168 160h76v42h1c11-20 39-42 81-42 86 0 102 57 102 130v174h-80V304c0-40-1-92-56-92s-64 43-64 88v164h-80z"/>' },
  cafe: { vb: '0 0 512 512', body: S('<path d="M64 112h288v128a128 128 0 01-128 128h-32A128 128 0 0164 240z"/><path d="M352 136h28a68 68 0 010 136h-32"/><path d="M48 432h352"/>') },
};

export function icon(name: string, size?: number): string {
  const def = ICONS[name];
  if (!def) return '';
  const dim = size ? ` width="${size}" height="${size}"` : ` width="1em" height="1em"`;
  return `<svg viewBox="${def.vb}"${dim} aria-hidden="true" focusable="false">${def.body}</svg>`;
}

class IonIconShim extends HTMLElement {
  static get observedAttributes() { return ['name']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  private render() {
    const name = this.getAttribute('name') || '';
    this.innerHTML = icon(name);
    this.style.display = 'inline-block';
    this.style.width = '1em';
    this.style.height = '1em';
    this.style.verticalAlign = '-0.125em';
  }
}

if (!customElements.get('ion-icon')) {
  customElements.define('ion-icon', IonIconShim);
}
