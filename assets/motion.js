/* ==========================================================================
   SmartKove — motion.js
   Card image scrub, gallery hover-zoom, lightbox, sliders, navigation
   progress bar, image loading states, skeletons, page-transition morphs.
   Vanilla JS, no dependencies. Loaded with defer after theme.js.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  window.SK = window.SK || {};

  /* ------------------------------------------------------------------------
     Progress bar — navigation and AJAX. Appears only after 150ms (CSS
     delay), so fast loads never flash a loader.
     ------------------------------------------------------------------------ */
  const Progress = {
    el: null,
    pending: 0,
    ensure() {
      if (this.el) return this.el;
      this.el = document.createElement('div');
      this.el.className = 'progress-bar';
      this.el.setAttribute('aria-hidden', 'true');
      this.el.innerHTML = '<span></span>';
      document.body.append(this.el);
      return this.el;
    },
    start() {
      const el = this.ensure();
      this.pending += 1;
      el.classList.remove('is-done');
      // Restart from zero: drop the class, force a style flush, re-add
      el.classList.remove('is-active');
      void el.offsetWidth;
      el.classList.add('is-active');
    },
    done() {
      if (!this.el) return;
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending > 0) return;
      this.el.classList.add('is-done');
      setTimeout(() => { if (!this.pending) this.el.classList.remove('is-active', 'is-done'); }, 450);
    },
    reset() { this.pending = 0; this.el?.classList.remove('is-active', 'is-done'); },
  };
  window.SK.Progress = Progress;

  // Page navigation: start on click of a normal same-origin link
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // hash / same page
    // Let other handlers (drawers, filters, search) claim the click first
    setTimeout(() => { if (!e.defaultPrevented) Progress.start(); }, 0);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) Progress.reset(); });

  /* ------------------------------------------------------------------------
     Image loading — shimmer until decoded, then a 300ms fade.
     Only lazy images; above-the-fold (eager/high priority) are never hidden.
     ------------------------------------------------------------------------ */
  const ImageLoad = {
    scan(ctx = document) {
      if (!ctx) return;
      $$('.media img[loading="lazy"]:not(.is-loaded)', ctx).forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
          img.style.transition = 'none';
          img.classList.add('is-loaded');
          requestAnimationFrame(() => { img.style.transition = ''; });
          return;
        }
        if (img._skWatch) return;
        img._skWatch = true;
        const finish = () => img.classList.add('is-loaded');
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
      });
    },
  };
  window.SK.ImageLoad = ImageLoad;

  /* ------------------------------------------------------------------------
     Skeletons
     ------------------------------------------------------------------------ */
  const Skeleton = {
    card() {
      return '<li class="skeleton-card" aria-hidden="true"><div class="skeleton skeleton-media"></div><div class="skeleton skeleton-line" style="width:70%"></div><div class="skeleton skeleton-line" style="width:35%"></div></li>';
    },
    grid(root) {
      const grid = root && $('.product-grid', root);
      if (!grid) return;
      const count = Math.min(grid.children.length || 8, 12);
      grid.setAttribute('aria-busy', 'true');
      grid.innerHTML = Array.from({ length: count }, () => this.card()).join('');
    },
    rows(n) {
      return Array.from({ length: n }, () => '<div class="skeleton-row" aria-hidden="true"><div class="skeleton skeleton-media"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div>').join('');
    },
  };
  window.SK.Skeleton = Skeleton;

  /* ------------------------------------------------------------------------
     Card image scrub — pointer position across the image picks the photo.
     Fine pointers only; touch shows the first image (swiping would fight
     the row's own horizontal scroll).
     ------------------------------------------------------------------------ */
  function setCardImage(media, index) {
    const imgs = $$('img', media);
    const dots = $$('.card__dots span', media);
    if (media._index === index) return;
    media._index = index;
    imgs.forEach((img, i) => img.toggleAttribute('data-active', i === index));
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    media.classList.toggle('is-first', index === 0);
  }
  document.addEventListener('pointermove', (e) => {
    if (!finePointer.matches || e.pointerType !== 'mouse') return;
    // The card's title link stretches over the whole card, so resolve the
    // image through the card rather than the event target.
    const media = e.target.closest?.('.card')?.querySelector('[data-card-scrub]');
    if (!media) return;
    const imgs = media.querySelectorAll('img');
    const rect = media.getBoundingClientRect();
    const ratio = Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width));
    setCardImage(media, Math.floor(ratio * imgs.length));
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const card = e.target.closest?.('.card');
    const media = card?.querySelector('[data-card-scrub]');
    if (media && !card.contains(e.relatedTarget)) setCardImage(media, 0);
  });

  /* ------------------------------------------------------------------------
     Gallery hover zoom — 2× around the cursor. Origin tracks the pointer
     1:1; only the scale eases. Set on the <img> itself (not a parent CSS
     variable) so no other elements recalculate styles.
     ------------------------------------------------------------------------ */
  function initHoverZoom(ctx = document) {
    $$('[data-zoom]', ctx).forEach((btn) => {
      if (btn._zoom) return;
      btn._zoom = true;
      const img = $('img', btn);
      if (!img) return;
      const track = (e) => {
        const r = btn.getBoundingClientRect();
        img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
      };
      btn.addEventListener('pointerenter', (e) => {
        if (!finePointer.matches || e.pointerType !== 'mouse') return;
        track(e);
        btn.classList.add('is-zoomed');
      });
      btn.addEventListener('pointermove', (e) => { if (btn.classList.contains('is-zoomed')) track(e); });
      btn.addEventListener('pointerleave', () => btn.classList.remove('is-zoomed'));
    });
  }

  /* ------------------------------------------------------------------------
     Lightbox — full screen, swipe between photos, tap/click to zoom 2.5×
     at that point, drag to pan. Opens with a morph from the tapped image
     (View Transitions) where supported, otherwise a quick scale-fade.
     ------------------------------------------------------------------------ */
  class Lightbox {
    constructor(root) {
      this.root = root;
      this.dialog = $('[data-lightbox]', root);
      if (!this.dialog) return;
      this.track = $('[data-lightbox-track]', this.dialog);
      this.slides = $$('.lightbox__slide', this.dialog);
      this.count = $('[data-lightbox-count]', this.dialog);
      this.index = 0;

      root.addEventListener('click', (e) => {
        const opener = e.target.closest('[data-open-lightbox]');
        if (opener && !opener.closest('[data-lightbox]')) this.open(parseInt(opener.dataset.openLightbox, 10), $('img', opener));
      });
      $('[data-lightbox-close]', this.dialog).addEventListener('click', () => this.close());
      $('[data-lightbox-prev]', this.dialog)?.addEventListener('click', () => this.go(this.index - 1));
      $('[data-lightbox-next]', this.dialog)?.addEventListener('click', () => this.go(this.index + 1));
      this.dialog.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
      this.dialog.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') this.go(this.index + 1);
        if (e.key === 'ArrowLeft') this.go(this.index - 1);
      });
      this.track.addEventListener('scroll', () => {
        const i = Math.round(this.track.scrollLeft / this.track.clientWidth);
        if (i !== this.index) { this.resetZoom(); this.setIndex(i); }
      }, { passive: true });
      $$('[data-lightbox-zoom]', this.dialog).forEach((z) => this.bindZoom(z));
    }

    setIndex(i) {
      this.index = i;
      if (this.count) this.count.textContent = `${i + 1} / ${this.slides.length}`;
    }

    go(i) {
      if (i < 0 || i >= this.slides.length) return;
      this.resetZoom();
      this.track.scrollTo({ left: i * this.track.clientWidth, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      this.setIndex(i);
    }

    targetImg() { return $('img', this.slides[this.index]); }

    open(i, fromImg) {
      this.setIndex(i);
      const show = () => {
        this.dialog.showModal();
        document.body.classList.add('is-locked');
        this.track.scrollTo({ left: i * this.track.clientWidth, behavior: 'auto' });
        const big = this.targetImg();
        if (big) big.loading = 'eager';
      };
      this.morph(fromImg, () => this.targetImg(), show);
    }

    close() {
      if (!this.dialog.open) return;
      // Sync the page gallery to the photo the shopper ended on, so the
      // image closes back into the same place it opened from.
      const galleryBtn = $$('[data-open-lightbox]', this.root).find((b) => parseInt(b.dataset.openLightbox, 10) === this.index);
      const slide = galleryBtn?.closest('.gallery__slide');
      if (slide) slide.parentElement.scrollTo({ left: slide.offsetLeft, behavior: 'auto' });
      const finish = () => {
        this.resetZoom();
        this.dialog.classList.remove('is-closing');
        this.dialog.close();
        if (!$('.drawer.is-open')) document.body.classList.remove('is-locked');
        galleryBtn?.focus({ preventScroll: true });
      };
      if (this.canMorph()) { this.morph(this.targetImg(), () => $('img', galleryBtn), finish); return; }
      if (reduceMotion.matches) { finish(); return; }
      this.dialog.classList.add('is-closing');
      setTimeout(finish, 180);
    }

    canMorph() { return !!document.startViewTransition && !reduceMotion.matches; }

    // Shared-element morph between two images with the View Transitions API
    morph(fromImg, getToImg, update) {
      if (!this.canMorph() || !fromImg) { update(); return; }
      fromImg.style.viewTransitionName = 'lightbox-image';
      this.dialog.classList.add('no-anim');
      const vt = document.startViewTransition(() => {
        fromImg.style.viewTransitionName = '';
        update();
        const to = getToImg();
        if (to) to.style.viewTransitionName = 'lightbox-image';
      });
      vt.finished.finally(() => {
        const to = getToImg();
        if (to) to.style.viewTransitionName = '';
        fromImg.style.viewTransitionName = '';
        this.dialog.classList.remove('no-anim');
      });
    }

    bindZoom(zone) {
      const img = $('img', zone);
      let scale = 1, panX = 0, panY = 0, start = null, moved = false;
      const apply = () => {
        img.style.setProperty('--scale', scale);
        img.style.setProperty('--pan-x', `${panX}px`);
        img.style.setProperty('--pan-y', `${panY}px`);
      };
      const clamp = () => {
        const w = img.offsetWidth * scale, h = img.offsetHeight * scale;
        const mx = Math.max(0, (w - zone.clientWidth) / 2), my = Math.max(0, (h - zone.clientHeight) / 2);
        panX = Math.min(mx, Math.max(-mx, panX));
        panY = Math.min(my, Math.max(-my, panY));
      };
      zone._reset = () => { scale = 1; panX = 0; panY = 0; apply(); zone.classList.remove('is-zoomed', 'is-dragging'); this.dialog.classList.remove('is-zoomed'); };

      zone.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        start = { x: e.clientX, y: e.clientY, px: panX, py: panY };
        moved = false;
        if (scale > 1) { zone.setPointerCapture(e.pointerId); zone.classList.add('is-dragging'); }
      });
      zone.addEventListener('pointermove', (e) => {
        if (!start) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (scale > 1) { panX = start.px + dx; panY = start.py + dy; clamp(); apply(); }
      });
      const end = (e) => {
        if (!start) return;
        zone.classList.remove('is-dragging');
        const wasMoved = moved;
        start = null;
        if (wasMoved) return;
        // A tap: toggle zoom around the tapped point
        if (scale === 1) {
          const r = img.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
          scale = 2.5;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          panX = (cx - e.clientX) * (scale - 1);
          panY = (cy - e.clientY) * (scale - 1);
          clamp();
          zone.classList.add('is-zoomed');
          this.dialog.classList.add('is-zoomed');
        } else {
          zone._reset();
          return;
        }
        apply();
      };
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', () => { start = null; zone.classList.remove('is-dragging'); });
    }

    resetZoom() { $$('[data-lightbox-zoom]', this.dialog).forEach((z) => z._reset?.()); }
  }

  /* ------------------------------------------------------------------------
     Slider — native scroll-snap (touch, trackpad and momentum all free),
     arrows page by one view, progress thumb is a transform.
     ------------------------------------------------------------------------ */
  function initSliders(ctx = document) {
    $$('[data-slider]', ctx).forEach((slider) => {
      if (slider._slider) return;
      slider._slider = true;
      const track = $('[data-slider-track]', slider);
      const prev = $('[data-slider-prev]', slider);
      const next = $('[data-slider-next]', slider);
      const thumb = $('[data-slider-progress]', slider);
      if (!track) return;
      let ticking = false;
      const update = () => {
        ticking = false;
        const max = track.scrollWidth - track.clientWidth;
        slider.toggleAttribute('data-overflow', max > 2);
        if (prev) prev.disabled = track.scrollLeft <= 2;
        if (next) next.disabled = track.scrollLeft >= max - 2;
        if (thumb && max > 0) {
          const frac = track.clientWidth / track.scrollWidth;
          const p = track.scrollLeft / max;
          thumb.style.width = `${frac * 100}%`;
          thumb.style.transform = `translateX(${p * (1 / frac - 1) * 100}%)`;
        }
      };
      const page = (dir) => {
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        track.scrollBy({ left: dir * (track.clientWidth + gap), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      };
      prev?.addEventListener('click', () => page(-1));
      next?.addEventListener('click', () => page(1));
      track.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      if ('ResizeObserver' in window) new ResizeObserver(update).observe(track);
      update();
    });
  }

  /* ------------------------------------------------------------------------
     Page transitions — product image morphs between card and product page.
     The incoming side (pagereveal) lives in layout/theme.liquid <head>,
     because it must be registered before first render.
     ------------------------------------------------------------------------ */
  let lastCardMedia = null;
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card, .hero__tile');
    lastCardMedia = card ? $('[data-product-handle]', card) : null;
  }, true);

  window.addEventListener('pageswap', (e) => {
    if (!e.viewTransition || !e.activation?.entry?.url) return;
    const to = new URL(e.activation.entry.url);
    const toHandle = (to.pathname.match(/\/products\/([^/?#]+)/) || [])[1];
    let el = null;
    const qvTrack = toHandle && $(`dialog.quick-view[open] [data-product-handle="${CSS.escape(toHandle)}"]`);
    if (qvTrack) {
      // Leaving from quick view: the photo currently showing in the modal
      el = $$('img', qvTrack).find((img) => {
        const r = img.getBoundingClientRect(), t = qvTrack.getBoundingClientRect();
        return r.left >= t.left - 2 && r.right <= t.right + 2;
      }) || null;
    } else if (toHandle) {
      // Leaving a list for a product: the clicked card's visible photo
      const media = lastCardMedia?.dataset.productHandle === toHandle
        ? lastCardMedia
        : $$(`[data-product-handle="${CSS.escape(toHandle)}"]`).find(inViewport);
      el = media && ($('img[data-active]', media) || $('img', media));
    } else if (/\/products\//.test(location.pathname)) {
      // Leaving a product page: its main photo flies back into the card
      el = $('img[data-vt-product]');
      if (el && !inViewport(el)) el = null;
    }
    if (!el) return;
    el.style.viewTransitionName = 'product-media';
    e.viewTransition.finished.finally(() => { el.style.viewTransitionName = ''; });
  });

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */
  function init(ctx = document) {
    ImageLoad.scan(ctx);
    initHoverZoom(ctx);
    initSliders(ctx);
    $$('[data-product-root]', ctx).forEach((root) => { if (!root._lightbox) root._lightbox = new Lightbox(root); });
  }

  document.addEventListener('shopify:section:load', (e) => init(e.target));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  window.SK.initMotion = init;
})();
