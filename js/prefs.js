/**
 * Reader preferences: the unified "Aa" menu (language + dyslexia-friendly
 * font), the light/dark toggle and the first-visit spotlight that points
 * new visitors at the Aa menu.
 *
 * Choices persist in localStorage; an inline <head> script applies them
 * before first paint so there is no flash of the wrong theme or font.
 */
import { setLang, t, LANGS } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/* ------------------------------------------------------------ language */
const savedLang = store.get('viz-lang');
const initialLang = LANGS[savedLang] ? savedLang : 'en';
const langReady = setLang(initialLang);

/* ------------------------------------------------------------ Aa menu */
const prefs = $('[data-prefs]');
const btn = $('[data-prefs-btn]');
const panel = $('[data-prefs-panel]');
const fontSwitch = $('[data-prefs-font]');

const isOpen = () => btn?.getAttribute('aria-expanded') === 'true';
function setOpen(open, { focus = true } = {}) {
  if (!btn || !panel) return;
  btn.setAttribute('aria-expanded', String(open));
  panel.hidden = !open;
  if (open) {
    dismissSpotlight();
    if (focus) ($('input:checked', panel) || $('input, button', panel))?.focus();
  } else if (focus && panel.contains(document.activeElement)) {
    btn.focus();
  }
}

if (btn && panel) {
  btn.addEventListener('click', () => setOpen(!isOpen()));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { setOpen(false); btn.focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !prefs.contains(e.target)) setOpen(false, { focus: false }); });
  prefs.addEventListener('focusout', (e) => { if (isOpen() && e.relatedTarget && !prefs.contains(e.relatedTarget)) setOpen(false, { focus: false }); });

  $$('input[name="viz-lang"]', panel).forEach((r) => {
    r.checked = r.value === initialLang;
    r.addEventListener('change', async () => {
      if (!r.checked) return;
      store.set('viz-lang', r.value === 'en' ? null : r.value);
      await setLang(r.value);
      syncLabels();
    });
  });
}

/* dyslexia-friendly font */
const setDyslexic = (on) => {
  if (on) root.dataset.font = 'dyslexic';
  else delete root.dataset.font;
  fontSwitch?.setAttribute('aria-checked', String(on));
  store.set('viz-font', on ? 'dyslexic' : null);
};
fontSwitch?.setAttribute('aria-checked', String(root.dataset.font === 'dyslexic'));
fontSwitch?.addEventListener('click', () => setDyslexic(root.dataset.font !== 'dyslexic'));

/* ------------------------------------------------------------ theme */
const themeBtn = $('[data-theme-toggle]');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const effectiveTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');

function syncLabels() {
  if (themeBtn) {
    const dark = effectiveTheme() === 'dark';
    themeBtn.setAttribute('aria-pressed', String(dark));
    themeBtn.setAttribute('aria-label', t(dark ? 'Switch to light mode' : 'Switch to dark mode'));
    themeBtn.title = themeBtn.getAttribute('aria-label');
  }
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = effectiveTheme() === 'dark' ? '#081624' : '#0F263A';
}
themeBtn?.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  // matching the system again means "follow the system" from now on
  if ((next === 'dark') === systemDark.matches) { delete root.dataset.theme; store.set('viz-theme', null); }
  else { root.dataset.theme = next; store.set('viz-theme', next); }
  syncLabels();
});
systemDark.addEventListener('change', syncLabels);
langReady.then(syncLabels);

/* ------------------------------------------------------------ first-visit spotlight */
let spot = null;
function dismissSpotlight() {
  if (!spot) return;
  store.set('viz-onboarded', '1');
  const el = spot;
  spot = null;
  el.classList.remove('is-in');
  window.removeEventListener('resize', placeSpotlight);
  window.removeEventListener('scroll', onSpotScroll);
  document.removeEventListener('keydown', onSpotKey);
  setTimeout(() => el.remove(), reduced ? 0 : 400);
}
function onSpotKey(e) { if (e.key === 'Escape') dismissSpotlight(); }
// the header shifts as the utility bar scrolls away: keep the ring and tip on the button,
// and lift the dimmed backdrop so it never blocks reading
let spotFrame = 0;
function onSpotScroll() {
  spot?.classList.add('is-settled');
  if (!spotFrame) spotFrame = requestAnimationFrame(() => { spotFrame = 0; placeSpotlight(); });
}

function placeSpotlight() {
  if (!spot || !btn) return;
  const r = btn.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  spot.style.setProperty('--sx', `${cx}px`);
  spot.style.setProperty('--sy', `${cy}px`);
  const tip = $('.spot__tip', spot);
  const w = Math.min(320, window.innerWidth - 24);
  tip.style.width = `${w}px`;
  tip.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, cx - w + 40))}px`;
  tip.style.top = `${r.bottom + 18}px`;
  tip.style.setProperty('--arrow-x', `${cx - parseFloat(tip.style.left)}px`);
}

function showSpotlight() {
  if (!btn || store.get('viz-onboarded') || isOpen()) return;
  spot = document.createElement('div');
  spot.className = 'spot';
  // written in all three languages: the visitor may not read the current one yet
  spot.innerHTML = `
    <div class="spot__dim" aria-hidden="true"></div>
    <div class="spot__ring" aria-hidden="true"></div>
    <div class="spot__tip" role="status" data-i18n-skip>
      <p class="spot__t"><span lang="en">Choose your language &amp; reading font</span></p>
      <p class="spot__alt"><span lang="de">Sprache &amp; Schrift wählen</span> · <span lang="hi">भाषा और फ़ॉन्ट चुनें</span></p>
      <p class="spot__d">English · Deutsch · हिन्दी — plus a dyslexia-friendly font. Look for <b>Aa</b>.</p>
      <div class="spot__actions">
        <button type="button" class="spot__open">Open <b>Aa</b></button>
        <button type="button" class="spot__ok">Got it</button>
      </div>
    </div>`;
  document.body.append(spot);
  // the dimmed layer sits above the header: a click on the spotlit Aa still opens the menu
  $('.spot__dim', spot).addEventListener('click', (e) => {
    const r = btn.getBoundingClientRect();
    const onBtn = e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
    if (onBtn) setOpen(true);
    else dismissSpotlight();
  });
  $('.spot__ok', spot).addEventListener('click', () => { dismissSpotlight(); btn.focus(); });
  $('.spot__open', spot).addEventListener('click', () => setOpen(true));
  window.addEventListener('resize', placeSpotlight);
  window.addEventListener('scroll', onSpotScroll, { passive: true });
  document.addEventListener('keydown', onSpotKey);
  placeSpotlight();
  requestAnimationFrame(() => spot?.classList.add('is-in'));
  // the dimmed backdrop lifts on its own; the pointer stays until acknowledged
  setTimeout(() => spot?.classList.add('is-settled'), 6000);
}

if (btn && !store.get('viz-onboarded')) {
  const start = () => setTimeout(showSpotlight, reduced ? 300 : 1100);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
