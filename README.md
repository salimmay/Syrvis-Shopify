# SmartKove — Shopify theme

A custom Online Store 2.0 theme for SmartKove (smart home, desk and phone gadgets).
Light, Apple-inspired design; vanilla JS, no build step, no dependencies.

## Put it on Shopify (GitHub)

1. Create a GitHub repo (e.g. `smartkove-theme`) and push the contents of this folder to the `main` branch,
   so `layout/`, `sections/`, `templates/`… sit at the repo root.
2. In Shopify admin: **Online Store → Themes → Add theme → Connect from GitHub**, pick the repo and branch.
3. Click **Customize** to edit everything visually. Edits made in the editor are committed back to the branch.

Alternative with Shopify CLI: `shopify theme dev --store your-store.myshopify.com` for a live local preview,
then `shopify theme push`.

## Store setup this theme expects

| What | Where | Why |
| --- | --- | --- |
| Menu `main-menu` with sub-items (Smart Home → Hubs, Lighting…) | Content → Menus | Items with children become the mega menu |
| Menu `footer` | Content → Menus | Footer "Help" column |
| Product tags `new`, `bestseller` | Products | Card badges |
| Metafield `custom.specs` (multi-line text) on products | Settings → Custom data → Products | Specs table. One line per spec: `Connectivity: Wi-Fi, Bluetooth 5.2` |
| Filters (Availability, Price, a "Works with" metafield…) | Search & Discovery app | Collection filters |
| Review app that writes `reviews.rating` | Any (Judge.me, Shopify Product Reviews…) | Star ratings |

## Homepage hero

Theme editor → Hero → **Layout**: `Split` (default), `Stage` or `Bento`.
Split shows the first 4 products of the collection you pick.

## Motion rules used

- Curves: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`.
- UI motion stays under 300ms (drawers 420ms); only `transform` / `opacity`.
- Hover effects only on real mouse pointers; `prefers-reduced-motion` swaps movement for fades.
- Scroll reveals run once, on homepage marketing sections only — never on collection grids.

## Motion features (motion.css / motion.js)

- **Product cards:** moving the mouse across a photo flips through up to 4 product photos.
- **Product gallery:** arrows + keyboard + swipe, hover zoom (2×, follows the cursor), click for a full-screen lightbox
  with tap-to-zoom and drag.
- **Sliders:** "Shop by space" holds up to 12 collections; arrows, swipe and a progress bar appear when there's overflow.
- **Page transitions:** View Transitions API — the product photo morphs from the card into the product page and back
  (Chrome/Edge 126+, Safari 18.2+; other browsers load normally). Toggle in Theme settings → Motion.
- **Quick view:** an eye button on every product card opens the product in a modal (desktop) or a bottom sheet you can
  drag down to close (mobile): photos, price, options, add to cart, and "View full details". Content is fetched from
  `sections/quick-view.liquid` and pre-loaded on hover. Toggle in Theme settings → Products.
- **Loading:** top progress bar (only if a load takes >150ms), shimmer on images until they decode, skeleton cards for
  filters, search and recommendations, hover prefetch via Speculation Rules.

## Structure

```
assets/     base.css (design system), theme.js (cart, drawers, filters, search, variants), motion.css/js
config/     theme settings (colors, radius, cart behaviour, socials)
layout/     theme.liquid, password.liquid
locales/    en.default.json (all storefront text)
sections/   header, hero, product, collection, cart drawer, …
snippets/   product-card, price, icon, facets, cart-line, …
templates/  JSON templates for every page type + customer account pages
```
