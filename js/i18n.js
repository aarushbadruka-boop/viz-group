/**
 * Runtime localisation (English · Deutsch · हिन्दी).
 *
 * The HTML is authored in English. Dictionaries in ./i18n/<lang>.js map each
 * English string (whitespace-collapsed) to its translation. `apply()` walks
 * text nodes and a few attributes, remembers the English original and swaps
 * in the translation — so markup stays readable and untranslated strings
 * (codes, ratings, numbers) simply fall through unchanged.
 *
 *   data-i18n-skip  on an element: leave it and its descendants alone
 *                   (language names, live values that scripts update).
 *   t(str)          translate a string from JS (HUD, form messages …).
 *   'viz:langchange' is dispatched on document after every switch.
 */
export const LANGS = {
  en: { html: 'en-IN', label: 'English' },
  de: { html: 'de', label: 'Deutsch' },
  hi: { html: 'hi', label: 'हिन्दी' },
};
const ATTRS = ['aria-label', 'placeholder', 'title', 'alt', 'aria-valuetext'];
const DEVANAGARI_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;700;800&display=swap';

let lang = 'en';
let dict = null;
const textState = new WeakMap(); // Text node → { orig, applied }
const attrState = new WeakMap(); // Element → { [attr]: { orig, applied } }
const cache = {};

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const hasLetter = /\p{L}/u;

/** Translate one English string; unknown strings pass through. */
export function t(s) {
  if (!dict || s == null) return s;
  const hit = dict[norm(String(s))];
  return hit == null ? s : hit;
}

export const currentLang = () => lang;

function translateText(node) {
  let st = textState.get(node);
  // a script replaced the value since we last touched it → that is the new English original
  if (!st || node.nodeValue !== st.applied) st = { orig: node.nodeValue };
  const orig = st.orig;
  const hit = dict?.[norm(orig)];
  const next = hit == null ? orig : orig.match(/^\s*/)[0] + hit + orig.match(/\s*$/)[0];
  if (node.nodeValue !== next) node.nodeValue = next;
  st.applied = next;
  textState.set(node, st);
}

function translateAttrs(el) {
  let rec = attrState.get(el);
  if (!rec) { rec = {}; attrState.set(el, rec); }
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    let st = rec[a];
    if (!st || cur !== st.applied) st = { orig: cur };
    const hit = dict?.[norm(st.orig)];
    const next = hit == null ? st.orig : hit;
    if (cur !== next) el.setAttribute(a, next);
    st.applied = next;
    rec[a] = st;
  }
}

const skipped = (el) => !el || el.closest('script, style, noscript, [data-i18n-skip]');

/** Translate everything under `root` into the current language. */
export function apply(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (hasLetter.test(n.nodeValue) && !skipped(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) translateText(n);
  const els = root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','));
  [root, ...els].forEach((el) => { if (el.nodeType === 1 && !skipped(el)) translateAttrs(el); });
}

function ensureDevanagari() {
  if (document.getElementById('font-devanagari')) return;
  const link = document.createElement('link');
  link.id = 'font-devanagari';
  link.rel = 'stylesheet';
  link.href = DEVANAGARI_CSS;
  document.head.append(link);
}

let headOrig = null;
function translateHead() {
  const desc = document.querySelector('meta[name="description"]');
  headOrig ??= { title: document.title, desc: desc?.content };
  document.title = t(headOrig.title);
  if (desc && headOrig.desc) desc.content = t(headOrig.desc);
}

/** Switch language (loads the dictionary on first use). */
export async function setLang(next) {
  if (!LANGS[next]) next = 'en';
  if (next === 'en') dict = null;
  else {
    cache[next] ??= (await import(`./i18n/${next}.js`)).default;
    dict = cache[next];
  }
  lang = next;
  if (next === 'hi') ensureDevanagari();
  document.documentElement.lang = LANGS[next].html;
  apply(document.body);
  translateHead();
  document.dispatchEvent(new CustomEvent('viz:langchange', { detail: { lang: next } }));
}

// lets lazily-built widgets (the 3D line) translate themselves without importing this module
window.vizI18n = { t, apply, setLang, get lang() { return lang; } };
