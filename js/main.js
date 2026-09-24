/**
 * VIZ Technologies — page behaviour.
 * Progressive enhancement: every section works without this file.
 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ header */
const header = $('[data-header]');
const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 24);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* ------------------------------------------------------------ mega menu */
const mega = $('.nav__item--mega');
if (mega) {
  const trigger = $('.nav__trigger', mega);
  let closeTimer;
  const setOpen = (open) => {
    mega.classList.toggle('is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
  };
  const hoverable = window.matchMedia('(hover: hover)').matches;
  if (hoverable) {
    mega.addEventListener('mouseenter', () => { clearTimeout(closeTimer); setOpen(true); });
    mega.addEventListener('mouseleave', () => { closeTimer = setTimeout(() => setOpen(false), 160); });
  }
  trigger.addEventListener('click', () => setOpen(!mega.classList.contains('is-open')));
  mega.addEventListener('focusout', (e) => { if (!mega.contains(e.relatedTarget)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mega.classList.contains('is-open')) { setOpen(false); trigger.focus(); } });
  document.addEventListener('click', (e) => { if (!mega.contains(e.target)) setOpen(false); });
  $$('a', mega).forEach((a) => a.addEventListener('click', () => setOpen(false)));
}

/* ------------------------------------------------------------ mobile menu */
const burger = $('[data-burger]');
const mobileMenu = $('[data-mobile-menu]');
if (burger && mobileMenu) {
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    mobileMenu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', mobileMenu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 1021px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
}

/* ------------------------------------------------------------ marquee */
$$('[data-marquee] .marquee__track').forEach((track) => {
  [...track.children].forEach((li) => {
    const clone = li.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.append(clone);
  });
});

/* ------------------------------------------------------------ reveal + counters */
const formatCount = (el, v) => {
  const f = el.dataset.format;
  if (f === 'k') return `${Math.round(v / 1000)}K`;
  if (f === 'comma') return Math.round(v).toLocaleString('en-US');
  if (el.dataset.pad) return String(Math.round(v)).padStart(+el.dataset.pad, '0');
  return String(Math.round(v));
};
const countUp = (el) => {
  const target = +el.dataset.count;
  if (reduced) { el.textContent = formatCount(el, target); return; }
  const start = performance.now(), dur = 1400;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    el.textContent = formatCount(el, target * (1 - Math.pow(1 - p, 4)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-visible');
    $$('[data-count]', e.target).forEach(countUp);
    if (e.target.matches('[data-count]')) countUp(e.target);
    io.unobserve(e.target);
  }),
  { threshold: 0.18, rootMargin: '0px 0px -40px 0px' },
);
$$('.reveal, .reveal-stagger, .hero__stats, .infra__panel').forEach((el) => io.observe(el));

/* ------------------------------------------------------------ product filters */
const bento = $('[data-bento]');
const filterBtns = $$('[data-filters] .filter');
const applyFilter = (cat) => {
  const run = () => {
    filterBtns.forEach((b) => {
      const on = b.dataset.filter === cat;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $$('.tile', bento).forEach((t) => {
      t.hidden = !(cat === 'all' || t.dataset.cat.split(' ').includes(cat));
    });
  };
  if (document.startViewTransition && !reduced) document.startViewTransition(run);
  else run();
};
filterBtns.forEach((b) => b.addEventListener('click', () => applyFilter(b.dataset.filter)));
$$('a[data-filter]').forEach((a) => a.addEventListener('click', () => applyFilter(a.dataset.filter)));

/* tile spotlight */
$$('.tile').forEach((tile) => {
  tile.addEventListener('pointermove', (e) => {
    const r = tile.getBoundingClientRect();
    tile.style.setProperty('--mx', `${e.clientX - r.left}px`);
    tile.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
});

/* ------------------------------------------------------------ hero 3D */
const heroStage = $('[data-hero-stage]');
if (heroStage) {
  import('./hero-scene.js')
    .then(({ mountHero }) => mountHero(heroStage))
    .catch((err) => console.warn('Hero 3D unavailable:', err));
}

/* ------------------------------------------------------------ manufacturing 3D (lazy) */
const factoryEl = $('[data-factory]');
let factoryPromise = null;
const loadFactory = () => {
  if (!factoryPromise && factoryEl) {
    factoryPromise = import('./factory/capacitor-factory.js')
      .then(({ CapacitorFactory }) => {
        const f = new CapacitorFactory(factoryEl, { stageDuration: 7 });
        factoryEl.vizFactory = f; // public handle for embedding / analytics hooks
        return f;
      })
      .catch((err) => { console.warn('Factory 3D unavailable:', err); return null; });
  }
  return factoryPromise;
};
if (factoryEl) {
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) { loadFactory(); obs.disconnect(); }
  }, { rootMargin: '600px 0px' }).observe(factoryEl);
}
// "See stage NN" deep links
$$('a[href="#process"][data-stage]').forEach((a) => {
  a.addEventListener('click', () => {
    loadFactory()?.then((f) => f?.goToStage(+a.dataset.stage));
  });
});

/* ------------------------------------------------------------ contact form → mailto */
const form = $('[data-contact-form]');
if (form) {
  const status = $('[data-form-status]', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const invalid = [];
    if (!data.name?.trim()) invalid.push(form.elements.name);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) invalid.push(form.elements.email);
    [form.elements.name, form.elements.email].forEach((el) => el.setAttribute('aria-invalid', String(invalid.includes(el))));
    if (invalid.length) {
      status.textContent = 'Please add your name and a valid email address.';
      status.classList.add('is-error');
      invalid[0].focus();
      return;
    }
    status.classList.remove('is-error');
    const lines = [`Name: ${data.name}`];
    if (data.company) lines.push(`Company: ${data.company}`);
    lines.push(`Email: ${data.email}`);
    if (data.phone) lines.push(`Phone: ${data.phone}`);
    lines.push(`Interest: ${data.interest}`, '', data.message || '');
    const body = lines.join('\n');
    const subject = `Enquiry — ${data.interest}${data.company ? ` — ${data.company}` : ''}`;
    window.location.href = `mailto:sales@viztechnologies.biz?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Your email app should open with the enquiry ready to send.';
  });
}

/* ------------------------------------------------------------ year */
$$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
