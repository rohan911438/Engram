# UI redesign — "Ink & Signal" (24 Oct 2026)

Inspired by godly.website, landdding.com, recent.design, motionin.design, footer.design and backgrounds.supply.

## Design system
- **Colours** (`src/index.css`): warm ink background `#0a0a09`, bone text `#f3efe6`, signal lime `#d4ff3a` (brand / primary), ember `#ff7a45` (brand-2, alerts), ok `#b6f25c`, warn `#ffc23d`, destructive `#ff5b4a`. Surfaces `surface-1/2/3`.
- **Type**: Bricolage Grotesque (display, all h1–h3), Geist (body), Geist Mono (`.label` uppercase captions), Instrument Serif italic in lime for headline accents.
- **Utilities**: `.label`, `.panel`, `.card-black`, `.bg-grid`, `.bg-dots`, `.grain`, `.text-outline`, `animate-marquee`.

## Done
- [x] Tokens, fonts, utilities, selection colour, favicon, theme-color
- [x] Brand mark (lime tile) and wallet connect modal theme
- [x] Homepage rebuilt: editorial giant-type hero, lime marquee band, bordered live stats, numbered "how it works" rows, bento features, paper-receipt proof card, alert-bar story grid, tabbed developer code panel, big CTA, footer with giant outlined wordmark
- [x] App shell: lime active nav, mono section labels, display-type page titles
- [x] Dashboard, Memory, History, Receipts, Link, sign-in gate recoloured; all violet/cyan hardcodes replaced
- [x] Tag palette, bento grid colours
- [x] Build passes; checked in the browser against the live backend (dashboard, history)
