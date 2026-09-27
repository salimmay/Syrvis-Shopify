/* ==========================================================================
   SmartKove — theme.js (vanilla, no dependencies)
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const routes = window.SK?.routes || { cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_url: '/cart', predictive_search_url: '/search/suggest' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const debounce = (fn, ms = 250) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const parseHTML = (html) => new DOMParser().parseFromString(html, 'text/html');

  /* ------------------------------------------------------------------------
     Focus trap helpers for drawers & modals
     ------------------------------------------------------------------------ */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastFocus = null;

  function trapFocus(container) {
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const nodes = $$(FOCUSABLE, container).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener('keydown', handler);
    container._trap = handler;
  }
  function releaseFocus(container) {
    if (container._trap) container.removeEventListener('keydown', container._trap);
    container._trap = null;
  }

  /* ------------------------------------------------------------------------
     Drawers (menu, cart, filters)
     ------------------------------------------------------------------------ */
  const Drawer = {
    open(id, trigger) {
      const el = document.getElementById(id);
      if (!el) return;
      lastFocus = trigger || document.activeElement;
      el.classList.add('is-open');
      el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-locked');
      $$(`[aria-controls="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
      trapFocus(el);
      // Focus after the panel has started moving so the jump isn't visible
      requestAnimationFrame(() => ($('[data-autofocus]', el) || $('.drawer__head button', el) || el).focus({ preventScroll: true }));
    },
    close(id) {
      const el = typeof id === 'string' ? document.getElementById(id) : id;
      if (!el || !el.classList.contains('is-open')) return;
      el.classList.remove('is-open');
      el.setAttribute('aria-hidden', 'true');
      if (!$('.drawer.is-open, .search-modal.is-open')) document.body.classList.remove('is-locked');
      $$(`[aria-controls="${el.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
      releaseFocus(el);
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    },
    closeAll() { $$('.drawer.is-open').forEach((d) => Drawer.close(d)); },
  };
  window.SK = Object.assign(window.SK || {}, { Drawer });

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-drawer-open]');
    if (opener) { e.preventDefault(); Drawer.open(opener.dataset.drawerOpen, opener); return; }
    const closer = e.target.closest('[data-drawer-close]');
    if (closer) { e.preventDefault(); Drawer.close(closer.closest('.drawer')); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('.search-modal.is-open')) { Search.close(); return; }
    Drawer.closeAll();
    Mega.closeAll();
  });

  /* ------------------------------------------------------------------------
     Mega menu — hover intent on fine pointers, click everywhere
     ------------------------------------------------------------------------ */
  const Mega = {
    items: [],
    init() {
      this.items = $$('.site-nav__item[data-mega]');
      const header = $('.site-header');
      const setTop = () => { if (header) document.documentElement.style.setProperty('--mega-top', `${header.getBoundingClientRect().bottom}px`); };
      setTop();
      window.addEventListener('resize', debounce(setTop, 100));
      window.addEventListener('scroll', setTop, { passive: true });
      const fine = window.matchMedia('(hover: hover) and (pointer: fine)');

      this.items.forEach((item) => {
        const btn = $('.site-nav__link', item);
        let openTimer, closeTimer;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          item.classList.contains('is-open') ? this.close(item) : this.open(item);
        });
        item.addEventListener('pointerenter', () => {
          if (!fine.matches) return;
          clearTimeout(closeTimer);
          // If another menu is already open, switch instantly — no second delay
          const delay = this.items.some((i) => i !== item && i.classList.contains('is-open')) ? 0 : 90;
          openTimer = setTimeout(() => this.open(item), delay);
        });
        item.addEventListener('pointerleave', () => {
          if (!fine.matches) return;
          clearTimeout(openTimer);
          closeTimer = setTimeout(() => this.close(item), 140);
        });
        item.addEventListener('focusout', (e) => { if (!item.contains(e.relatedTarget)) this.close(item); });
      });
      document.addEventListener('click', (e) => { if (!e.target.closest('.site-nav__item')) this.closeAll(); });
    },
    open(item) {
      this.items.forEach((i) => i !== item && this.close(i, true));
      item.classList.add('is-open');
      $('.site-nav__link', item).setAttribute('aria-expanded', 'true');
    },
    close(item) {
      item.classList.remove('is-open');
      $('.site-nav__link', item).setAttribute('aria-expanded', 'false');
    },
    closeAll() { this.items.forEach((i) => this.close(i)); },
  };

  /* ------------------------------------------------------------------------
     Cart — AJAX API + Section Rendering
     ------------------------------------------------------------------------ */
  const Cart = {
    sections: ['cart-drawer'],

    async add(formData) {
      formData.append('sections', this.sectionsToRender().join(','));
      formData.append('sections_url', window.location.pathname);
      const res = await fetch(`${routes.cart_add_url}.js`, { method: 'POST', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: formData });
      const data = await res.json();
      if (!res.ok || data.status) throw new Error(data.description || data.message || 'Could not add to cart');
      this.renderSections(data.sections);
      await this.refreshCount();
      return data;
    },

    async change(line, quantity) {
      const res = await fetch(`${routes.cart_change_url}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line, quantity, sections: this.sectionsToRender(), sections_url: window.location.pathname }),
      });
      const data = await res.json();
      if (!res.ok || data.status) throw new Error(data.description || data.message || 'Could not update cart');
      this.renderSections(data.sections);
      this.setCount(data.item_count);
      return data;
    },

    sectionsToRender() {
      const list = [...this.sections];
      if ($('[data-cart-page]')) list.push($('[data-cart-page]').dataset.sectionId);
      return list;
    },

    renderSections(sections) {
      if (!sections) return;
      Object.entries(sections).forEach(([id, html]) => {
        if (!html) return;
        const doc = parseHTML(html);
        if (id === 'cart-drawer') {
          const next = $('[data-cart-drawer-content]', doc);
          const cur = $('[data-cart-drawer-content]');
          if (next && cur) cur.replaceWith(next);
        } else {
          const next = $('[data-cart-page]', doc);
          const cur = $('[data-cart-page]');
          if (next && cur) cur.replaceWith(next);
        }
      });
      requestAnimationFrame(() => $$('.shipping-meter__fill').forEach((f) => f.style.setProperty('--progress', f.dataset.progress)));
    },

    async refreshCount() {
      const res = await fetch(`${routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
      const cart = await res.json();
      this.setCount(cart.item_count);
    },

    setCount(count) {
      $$('[data-cart-count]').forEach((el) => {
        const prev = parseInt(el.textContent, 10) || 0;
        el.textContent = count;
        el.hidden = count === 0;
        if (count > prev && !reduceMotion.matches) {
          el.classList.add('is-bumped');
          setTimeout(() => el.classList.remove('is-bumped'), 140);
        }
      });
    },
  };
  window.SK.Cart = Cart;

  // Quantity & remove inside cart drawer / cart page (delegated, survives re-render)
  const changeLine = async (lineEl, qty) => {
    lineEl.classList.add('is-loading');
    try { await Cart.change(parseInt(lineEl.dataset.line, 10), qty); }
    catch (err) { lineEl.classList.remove('is-loading'); showCartError(err.message); }
  };
  const debouncedChange = debounce(changeLine, 350);

  function showCartError(msg) {
    $$('[data-cart-error]').forEach((el) => { el.textContent = msg; el.hidden = false; });
  }

  document.addEventListener('click', (e) => {
    const step = e.target.closest('[data-qty-step]');
    if (step) {
      const wrap = step.closest('.qty');
      const input = $('input', wrap);
      const min = parseInt(input.min || '0', 10);
      const max = input.max ? parseInt(input.max, 10) : Infinity;
      const next = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + parseInt(step.dataset.qtyStep, 10)));
      input.value = next;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const remove = e.target.closest('[data-cart-remove]');
    if (remove) { e.preventDefault(); changeLine(remove.closest('[data-line]'), 0); }
  });
  document.addEventListener('change', (e) => {
    const input = e.target.closest('[data-line] .qty input');
    if (input) debouncedChange(input.closest('[data-line]'), parseInt(input.value, 10) || 0);
  });

  /* ------------------------------------------------------------------------
     Product form — variant picking, gallery sync, add to cart
     ------------------------------------------------------------------------ */
  class ProductForm {
    constructor(root) {
      this.root = root;
      this.form = $('form[data-product-form]', root);
      if (!this.form) return;
      this.variants = JSON.parse($('[data-variants-json]', root)?.textContent || '[]');
      this.idInput = $('input[name="id"]', this.form);
      this.atc = $('[data-atc]', root);
      this.stickyAtc = $('[data-sticky-atc]', root);
      this.inQuickView = !!root.closest('.quick-view');
      this.priceEl = $('[data-price]', root);
      this.stockEl = $('[data-stock]', root);
      this.errorEl = $('[data-form-error]', root);
      this.gallery = root.querySelector('[data-gallery]') ? new Gallery(root.querySelector('[data-gallery]')) : null;

      root.addEventListener('change', (e) => { if (e.target.closest('[data-option-input]')) this.onOptionChange(); });
      this.form.addEventListener('submit', (e) => this.onSubmit(e));
      this.stickyAtc?.addEventListener('click', () => this.atc.click());
      this.updateAvailability();
      this.watchSticky();
    }

    selectedOptions() {
      return $$('fieldset[data-option-index]', this.root).map((fs) => $('input:checked', fs)?.value);
    }

    onOptionChange() {
      const opts = this.selectedOptions();
      const variant = this.variants.find((v) => v.options.every((o, i) => o === opts[i]));
      $$('fieldset[data-option-index]', this.root).forEach((fs, i) => {
        const sel = $('[data-selected-value]', fs);
        if (sel) sel.textContent = opts[i] || '';
      });
      this.updateAvailability();
      if (!variant) { this.setAtc(false, this.atc.dataset.unavailableText); return; }
      this.idInput.value = variant.id;
      if (this.priceEl) this.priceEl.innerHTML = variant.price_html;
      if (this.stockEl) { this.stockEl.className = `stock ${variant.stock_class}`; this.stockEl.textContent = variant.stock_text; }
      this.setAtc(variant.available, variant.available ? this.atc.dataset.addText : this.atc.dataset.soldOutText);
      if (variant.featured_media_id && this.gallery) this.gallery.goTo(variant.featured_media_id);
      // In quick view, point the "full details" link at the chosen variant
      // instead of rewriting the page's own URL.
      if (this.inQuickView) {
        const full = $('.qv__full', this.root);
        if (full) { const u = new URL(full.href, location.origin); u.searchParams.set('variant', variant.id); full.href = u.pathname + u.search; }
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      history.replaceState(null, '', url);
    }

    // Mark option values that can't combine with the other current selections
    updateAvailability() {
      const opts = this.selectedOptions();
      $$('fieldset[data-option-index]', this.root).forEach((fs) => {
        const idx = parseInt(fs.dataset.optionIndex, 10);
        $$('input', fs).forEach((input) => {
          const ok = this.variants.some((v) => v.available && v.options[idx] === input.value && v.options.every((o, i) => i === idx || o === opts[i]));
          input.classList.toggle('is-unavailable', !ok);
        });
      });
    }

    setAtc(enabled, text) {
      [this.atc, this.stickyAtc].forEach((btn) => {
        if (!btn) return;
        btn.disabled = !enabled;
        const label = $('.atc__label--idle', btn) || btn;
        if (text) label.textContent = text;
      });
    }

    async onSubmit(e) {
      e.preventDefault();
      if (this.atc.dataset.state === 'busy') return;
      this.errorEl && (this.errorEl.hidden = true);
      this.atc.dataset.state = 'busy';
      this.atc.setAttribute('aria-busy', 'true');
      try {
        await Cart.add(new FormData(this.form));
        this.atc.dataset.state = 'done';
        setTimeout(() => { this.atc.dataset.state = 'idle'; }, 1200);
        if (this.inQuickView && window.SK.settings?.cartType !== 'none') {
          // Let the "Added ✓" state register, then hand over to the cart
          await new Promise((r) => setTimeout(r, 450));
          await QuickView.close();
        }
        if (window.SK.settings?.cartType === 'drawer') Drawer.open('CartDrawer', this.atc);
        else if (window.SK.settings?.cartType === 'page') window.location.href = routes.cart_url;
      } catch (err) {
        this.atc.dataset.state = 'idle';
        if (this.errorEl) { this.errorEl.textContent = err.message; this.errorEl.hidden = false; }
      } finally {
        this.atc.removeAttribute('aria-busy');
      }
    }

    watchSticky() {
      if (!this.stickyAtc) return;
      // Scroll check (rAF-throttled) rather than IntersectionObserver: an IO
      // misses a jump from "below viewport" straight to "above viewport".
      const bar = this.stickyAtc.closest('.sticky-atc');
      let ticking = false;
      const update = () => {
        ticking = false;
        bar.classList.toggle('is-visible', this.atc.getBoundingClientRect().bottom < 0);
      };
      window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      update();
    }
  }

  class Gallery {
    constructor(root) {
      this.root = root;
      this.track = $('.gallery__track', root);
      this.slides = $$('.gallery__slide', root);
      this.thumbs = $$('.gallery__thumb', root);
      this.dots = $$('.gallery__dots span', root);
      this.counter = $('[data-gallery-current]', root);
      this.prev = $('[data-gallery-prev]', root);
      this.next = $('[data-gallery-next]', root);
      this.current = 0;
      this.thumbs.forEach((t, i) => t.addEventListener('click', () => this.show(i)));
      this.prev?.addEventListener('click', () => this.show(this.current - 1));
      this.next?.addEventListener('click', () => this.show(this.current + 1));
      this.track?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); this.show(this.current + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.show(this.current - 1); }
      });
      this.mark(0);
      if ('IntersectionObserver' in window && this.track) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((en) => { if (en.isIntersecting && en.intersectionRatio > 0.6) this.mark(this.slides.indexOf(en.target)); });
        }, { root: this.track, threshold: [0.6] });
        this.slides.forEach((s) => io.observe(s));
      }
    }
    show(i) {
      const slide = this.slides[i];
      if (!slide) return;
      // Native smooth scroll: it's interruptible (a new click retargets
      // mid-flight) and follows the finger on touch. Reduced motion → jump.
      this.track.scrollTo({ left: slide.offsetLeft, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      this.mark(i);
    }
    goTo(mediaId) {
      const i = this.slides.findIndex((s) => s.dataset.mediaId === String(mediaId));
      if (i > -1) this.show(i);
    }
    mark(i) {
      if (i < 0) return;
      this.current = i;
      this.thumbs.forEach((t, j) => t.setAttribute('aria-current', String(i === j)));
      this.dots.forEach((d, j) => d.classList.toggle('is-active', i === j));
      if (this.counter) this.counter.textContent = i + 1;
      if (this.prev) this.prev.disabled = i === 0;
      if (this.next) this.next.disabled = i === this.slides.length - 1;
    }
  }

  // Quick add from product cards (single-variant products)
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-quick-add]');
    if (!form) return;
    e.preventDefault();
    const btn = $('button', form);
    btn.disabled = true;
    try {
      await Cart.add(new FormData(form));
      Drawer.open('CartDrawer', btn);
    } catch (err) {
      alertInline(form, err.message);
    } finally {
      btn.disabled = false;
    }
  });
  function alertInline(form, msg) {
    const el = document.createElement('p');
    el.className = 'form-status form-status--error small';
    el.textContent = msg;
    form.closest('.card')?.append(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ------------------------------------------------------------------------
     Collection filters & sorting (Section Rendering API)
     ------------------------------------------------------------------------ */
  const Facets = {
    init() {
      const root = $('[data-collection-root]');
      if (!root) return;
      this.sectionId = root.dataset.sectionId;
      const onChange = debounce((form) => this.submit(form), 400);
      document.addEventListener('change', (e) => {
        const form = e.target.closest('form[data-facets-form]');
        if (!form) return;
        // Keep the mirrored forms (sidebar + drawer + sort) in sync
        onChange(form);
      });
      document.addEventListener('input', (e) => {
        const form = e.target.closest('form[data-facets-form]');
        if (form && e.target.type === 'number') onChange(form);
      });
      document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-facet-link]');
        if (!link) return;
        e.preventDefault();
        this.render(new URL(link.href, window.location.origin).search.slice(1));
      });
      window.addEventListener('popstate', () => this.render(window.location.search.slice(1), false));
    },
    submit(form) {
      // Filters come from the form that changed (sidebar or drawer — both
      // re-render in sync); sort always comes from the toolbar select.
      const filters = form.dataset.facetsForm === 'filters' ? form : $('form[data-facets-form="filters"]');
      const params = new URLSearchParams();
      if (filters) new FormData(filters).forEach((v, k) => { if (v !== '' && k !== 'sort_by') params.append(k, v); });
      const sort = $('form[data-facets-form="sort"] select[name="sort_by"]');
      if (sort) params.set('sort_by', sort.value);
      this.render(params.toString());
    },
    async render(query, push = true) {
      const root = $('[data-collection-root]');
      // Skeleton only if the response is slow (>200ms) — a flash of grey
      // on a fast response feels worse than no loader at all.
      const skeletonTimer = setTimeout(() => window.SK.Skeleton?.grid(root), 200);
      window.SK.Progress?.start();
      try {
        const res = await fetch(`${window.location.pathname}?${query}${query ? '&' : ''}section_id=${this.sectionId}`);
        const doc = parseHTML(await res.text());
        const next = $('[data-collection-root]', doc);
        if (next) root.replaceWith(next);
        const drawerFacets = $('[data-facets-drawer-body]', doc);
        if (drawerFacets && $('[data-facets-drawer-body]')) $('[data-facets-drawer-body]').replaceWith(drawerFacets);
        if (push) history.pushState({}, '', `${window.location.pathname}${query ? '?' + query : ''}`);
      } catch (err) {
        window.location.search = query;
      } finally {
        clearTimeout(skeletonTimer);
        window.SK.Progress?.done();
        window.SK.ImageLoad?.scan($('[data-collection-root]'));
      }
    },
  };

  /* ------------------------------------------------------------------------
     Predictive search
     ------------------------------------------------------------------------ */
  const Search = {
    init() {
      this.modal = $('#SearchModal');
      if (!this.modal) return;
      this.input = $('input[type="search"]', this.modal);
      this.results = $('[data-predictive-results]', this.modal);
      this.defaultResults = this.results.innerHTML;
      document.addEventListener('click', (e) => {
        const opener = e.target.closest('[data-search-open]');
        if (opener) { e.preventDefault(); this.open(opener); }
        if (e.target.closest('[data-search-close]')) this.close();
      });
      this.input.addEventListener('input', debounce(() => this.query(), 200));
      this.input.addEventListener('keydown', (e) => this.onKey(e));
    },
    open(trigger) {
      lastFocus = trigger;
      this.modal.classList.add('is-open');
      this.modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('is-locked');
      trapFocus(this.modal);
      requestAnimationFrame(() => this.input.focus());
    },
    close() {
      this.modal.classList.remove('is-open');
      this.modal.setAttribute('aria-hidden', 'true');
      if (!$('.drawer.is-open')) document.body.classList.remove('is-locked');
      releaseFocus(this.modal);
      lastFocus?.focus({ preventScroll: true });
    },
    async query() {
      const q = this.input.value.trim();
      if (!q) { this.results.innerHTML = this.defaultResults; return; }
      this.abort?.abort();
      this.abort = new AbortController();
      clearTimeout(this.skeletonTimer);
      this.skeletonTimer = setTimeout(() => { this.results.innerHTML = window.SK.Skeleton?.rows(4) || ''; }, 150);
      try {
        const res = await fetch(`${routes.predictive_search_url}?q=${encodeURIComponent(q)}&resources[limit]=6&resources[type]=product,collection,query&section_id=predictive-search`, { signal: this.abort.signal });
        const doc = parseHTML(await res.text());
        const next = $('[data-predictive-content]', doc);
        clearTimeout(this.skeletonTimer);
        this.results.innerHTML = next ? next.innerHTML : '';
        window.SK.ImageLoad?.scan(this.results);
        this.active = -1;
      } catch (err) { /* aborted */ }
    },
    onKey(e) {
      const items = $$('.predictive-item', this.results);
      if (!items.length || !['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
      if (e.key === 'Enter') {
        if (this.active > -1) { e.preventDefault(); items[this.active].click(); }
        return;
      }
      e.preventDefault();
      this.active = e.key === 'ArrowDown' ? (this.active + 1) % items.length : (this.active - 1 + items.length) % items.length;
      items.forEach((it, i) => it.setAttribute('aria-selected', String(i === this.active)));
      items[this.active].scrollIntoView({ block: 'nearest' });
    },
  };

  /* ------------------------------------------------------------------------
     Scroll reveal — marketing sections only, fires once
     ------------------------------------------------------------------------ */
  function initReveal(ctx = document) {
    const els = $$('.reveal:not(.is-visible)', ctx);
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-visible');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -80px 0px', threshold: 0.1 });
    els.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------------
     Misc
     ------------------------------------------------------------------------ */
  function initLocalization() {
    document.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-localization-select]');
      if (sel) sel.form.submit();
    });
  }

  function initProducts(ctx = document) {
    $$('[data-product-root]', ctx).forEach((root) => { if (!root._pf) root._pf = new ProductForm(root); });
  }

  /* ------------------------------------------------------------------------
     Quick view — a product's key details in a modal (desktop) or bottom
     sheet (mobile). Content comes from sections/quick-view.liquid via the
     Section Rendering API and is cached; hovering the button pre-loads it,
     so most of the time the modal opens already filled.
     ------------------------------------------------------------------------ */
  const QuickView = {
    cache: new Map(),
    sheetQuery: window.matchMedia('(max-width: 749px)'),

    init() {
      this.dialog = $('#QuickView');
      if (!this.dialog) return;
      this.panel = $('[data-qv-panel]', this.dialog);
      this.body = $('[data-qv-body]', this.dialog);

      document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-quick-view]');
        if (link) {
          // Cmd/Ctrl/middle-click keep their normal "open in new tab" meaning
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          this.open(link.href, link);
          return;
        }
        if (e.target.closest('[data-qv-close]')) this.close();
      });
      const warm = (e) => { const l = e.target.closest?.('[data-quick-view]'); if (l) this.load(l.href); };
      document.addEventListener('pointerover', warm, { passive: true });
      document.addEventListener('focusin', warm);
      this.dialog.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
      this.initDrag();
    },

    url(href) {
      const u = new URL(href, location.origin);
      u.searchParams.set('section_id', 'quick-view');
      return u.toString();
    },

    load(href) {
      const key = this.url(href);
      if (!this.cache.has(key)) {
        const p = fetch(key).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); });
        p.catch(() => this.cache.delete(key));
        this.cache.set(key, p);
      }
      return this.cache.get(key);
    },

    skeleton() {
      return '<div class="qv" aria-hidden="true"><div class="qv__media"><div class="skeleton" style="aspect-ratio:1;border-radius:var(--radius-m)"></div></div>'
        + '<div class="qv__info"><div class="skeleton skeleton-line" style="width:75%;height:1.8em"></div><div class="skeleton skeleton-line" style="width:30%;height:1.4em"></div>'
        + '<div class="skeleton skeleton-line" style="width:55%"></div><div class="skeleton" style="height:54px;border-radius:999px"></div>'
        + '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line" style="width:85%"></div></div></div>';
    },

    async open(href, trigger) {
      this.trigger = trigger;
      this.href = href;
      const cached = this.cache.has(this.url(href));
      this.body.innerHTML = cached ? '' : this.skeleton();
      this.panel.style.transform = '';
      this.dialog.classList.remove('is-closing');
      this.dialog.showModal();
      document.body.classList.add('is-locked');
      void this.panel.offsetWidth; // commit the closed state so the open transition runs
      this.dialog.classList.add('is-open');
      try {
        const html = await this.load(href);
        if (this.href !== href || !this.dialog.open) return;
        const content = $('[data-qv-content]', parseHTML(html));
        if (!content) throw new Error('no content');
        this.body.replaceChildren(content);
        initProducts(this.body);
        window.SK.ImageLoad?.scan(this.body);
        window.SK.initMotion?.(this.body);
      } catch (err) {
        window.location.href = href; // fall back to the full product page
      }
    },

    close() {
      return new Promise((resolve) => {
        if (!this.dialog?.open) { resolve(); return; }
        this.href = null;
        this.dialog.classList.remove('is-open');
        this.dialog.classList.add('is-closing');
        const done = () => {
          this.dialog.classList.remove('is-closing');
          this.dialog.close();
          this.panel.style.transform = '';
          if (!$('.drawer.is-open, .search-modal.is-open')) document.body.classList.remove('is-locked');
          if (this.trigger && document.contains(this.trigger)) this.trigger.focus({ preventScroll: true });
          resolve();
        };
        if (reduceMotion.matches) done();
        else setTimeout(done, this.sheetQuery.matches ? 320 : 180);
      });
    },

    // Mobile sheet: drag the handle down to dismiss. Tracks the finger 1:1,
    // resists upward drags, and a quick flick dismisses regardless of distance.
    initDrag() {
      const grab = $('[data-qv-grab]', this.dialog);
      if (!grab) return;
      let start = null;
      grab.addEventListener('pointerdown', (e) => {
        if (!this.sheetQuery.matches || start) return;
        start = { y: e.clientY, t: performance.now() };
        grab.setPointerCapture(e.pointerId);
        this.panel.style.transition = 'none';
      });
      grab.addEventListener('pointermove', (e) => {
        if (!start) return;
        let dy = e.clientY - start.y;
        if (dy < 0) dy = -Math.sqrt(-dy) * 2; // rubber-band upward
        this.panel.style.transform = `translateY(${dy}px)`;
      });
      const end = (e) => {
        if (!start) return;
        const dy = e.clientY - start.y;
        const velocity = dy / Math.max(1, performance.now() - start.t);
        start = null;
        this.panel.style.transition = '';
        if (dy > this.panel.offsetHeight * 0.25 || (velocity > 0.11 && dy > 10)) {
          this.panel.style.transform = '';
          this.close();
        } else {
          this.panel.style.transform = ''; // springs back via the CSS transition
        }
      };
      grab.addEventListener('pointerup', end);
      grab.addEventListener('pointercancel', end);
    },
  };
  window.SK.QuickView = QuickView;

  function init() {
    Mega.init();
    Facets.init();
    Search.init();
    QuickView.init();
    initProducts();
    initReveal();
    initLocalization();
    $$('.shipping-meter__fill').forEach((f) => f.style.setProperty('--progress', f.dataset.progress));
  }

  // Theme editor support
  document.addEventListener('shopify:section:load', (e) => { initProducts(e.target); initReveal(e.target); $$('.reveal', e.target).forEach((el) => el.classList.add('is-visible')); });
  document.addEventListener('shopify:section:select', (e) => { if (e.target.querySelector('#CartDrawer')) Drawer.open('CartDrawer'); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
