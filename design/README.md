# Irrigation page redesign

A draft redesign of `/irrigation`, built as native Gutenberg blocks.

| | |
|---|---|
| Page | ID **1958**, slug `irrigation-redesign`, status **published** |
| URL | https://leestreesaz.com/irrigation-redesign/ |
| Live page | `/irrigation` (ID 55) — **untouched** |

## Where things live

**Block markup** lives in WordPress (page 1958), not in this repo. It is composed
entirely of core blocks, so the block editor is the source of truth — editing it
here and pasting it back would be a step backwards. Export it from the editor via
Options → Code editor if you need a copy.

**`irrigation-page.css`** is a copy of what was added to Appearance → Customize →
Additional CSS. That is the only part of the design that does not live in block
attributes, and the only part with no other version-controlled home.

## How the design is split

The visual decisions a person would want to change are **block attributes**,
editable through the normal editor sidebar with no code:

- section background colours (hero green, tint bands, dark quote panel)
- section padding
- heading and paragraph colours and sizes
- button background and text colours
- column backgrounds and padding

The CSS file only covers what block supports cannot express: the uppercase brand
heading treatment, card top-border accents, the numbered step markers, the
testimonial quote glyph, FAQ accordion styling, and mobile button stacking.

Everything is scoped to `.lt-irr`, a class set on each top-level section group.
No other page carries that class, so the CSS cannot leak. To remove the design
entirely, delete page 1958 and drop the `.lt-irr` rules from Additional CSS.

## Blocks used

Core only — `group`, `cover`, `columns`, `column`, `heading`, `paragraph`,
`buttons`, `button`, `image`, `list`, `list-item`, `quote`, `details`,
`shortcode`. There are no `core/html` blocks and no page-builder dependency. The
quote form is the existing Elementor template (ID 155) pulled in through a
`core/shortcode` block, so there is still only one form to maintain.

## Photos

Ten photos, all from the existing media library — nothing was uploaded.

| Placement | Attachment | File |
|---|---|---|
| Hero (cover background) | 114 | `irrigation-service_A-min` |
| Valve repair card | 116 | `irrigation-valve_a-min` |
| Sprinkler repair card | 109 | `sprinkler-service_a-min` |
| Leak detection card | 117 | `leak-service_a-min` |
| Drip system card | 112 | `drip-system_a-min` |
| Design & consultation card | 118 | `arizona-home-landscape_a-min` |
| Full landscape integration card | 110 | `arizona-home-landscape_c-min` |
| Related: Tree Service | 308 | `tree-service_a-min` |
| Related: Artificial Grass | 163 | `artificial-grass_1-min` |
| Related: Paver Installation | 221 | `Pavers-1-min` |

Cards use the `medium_large` (768px) derivatives rather than the 2560px
originals, so the page does not ship ~20MB of imagery to a phone. The hero uses
the 1536px derivative behind a 60% dark-green overlay for text contrast.

Attachment 221 is portrait (2236×2560) while the rest are landscape, so card
images are cropped to a fixed height with `object-fit:cover` in the CSS. That
also means any replacement photo will line up regardless of its aspect ratio.

**Unverified:** photos were matched to services by filename. The site has no
vision API key configured and this environment cannot reach the image URLs, so
nobody has actually looked at them in this process. Alt text was written from the
filenames for the same reason. Both need a human pass.

## Page settings

Astra per-page meta is set for a full-width landing layout:
`site-sidebar-layout=no-sidebar`, `site-content-layout=page-builder`,
`ast-title-bar-display=disabled`, `ast-featured-img=disabled`.

## Still to check

The page has not been viewed in a browser. This environment's egress policy
blocks leestreesaz.com, so verification was structural only. Worth confirming:

1. The Elementor form renders cleanly inside the white panel on the dark section.
2. Mobile: four-column rows stack sensibly, buttons go full width.
3. No block shows an "unexpected or invalid content" notice in the editor.

## Conversion tracking

The site runs two Google tags, both injected site-wide by Site Kit, so both
already load on this page with no extra work:

| | |
|---|---|
| GA4 | `G-GW25RY0E3V` (`useSnippet: true`) |
| Google Tag Manager | `GTM-5G6NT4G` (`useSnippet: true`) |

Site Kit's Ads `conversionID` is empty, so any Google Ads conversion for
tap-to-call / contact is configured inside GTM, not in WordPress. GTM trigger
definitions live in the GTM UI and cannot be read from here.

### Phone link href must stay `tel:6234005499`

Every existing tap-to-call on the site uses exactly `tel:6234005499` — the
header button (`Elementor Header #15`, widget `5c2ef48`) and both footer
elements (`Elementor Footer #536`, widgets `b4852c4` and `dcad2d9`).

This page originally used the E.164 form `tel:+16234005499`. That is technically
the better href, but a GTM Click URL trigger set to *equals* or *contains*
`tel:6234005499` does not match it — the `+1` breaks both comparisons. The links
were changed to `tel:6234005499` to match the rest of the site. **Do not
"improve" them back to `+1` without first checking the GTM trigger.**

### The quote form is the tracked form

The page embeds Elementor template 155 by shortcode rather than rebuilding the
form in blocks. If the contact conversion fires on an Elementor form submission,
it fires here too, because it is literally the same form.

### The header "Contact" button already works here

That button links to `#quote`, which is a real anchor on this page.

## Two things worth checking on the live site

1. **The header tap-to-call button is hidden on every breakpoint.** Widget
   `5c2ef48` carries `hide_desktop`, `hide_tablet` *and* `hide_mobile`, so it
   never renders. The working mobile call CTA is the sticky footer bar
   (`Elementor Footer #536`), which is desktop/tablet-hidden and sticky on
   mobile. If tap-to-call conversions look low, this is a likely cause and it is
   unrelated to this page.
2. **Site Kit is set to `trackingDisabled: ["loggedinUsers"]`.** Testing the
   page while signed in to WordPress fires nothing. Verify tags in a logged-out
   or incognito window, or GA4 DebugView will look broken when it is fine.

## Reviews carousel

The three reviews sit in a horizontal scroll-snap track rather than a static row.

It is **CSS only** — no JavaScript, no carousel plugin, no new block. The markup
is still a plain `core/columns` with three `core/column` children; only the
`.lt-quotes` CSS changed. That means:

- All three reviews remain in the DOM and in the rendered page source, so they
  are still indexable and still readable by screen readers. This is the
  difference between this and the Elementor "slide to learn more" carousels that
  were removed from the old page — those hid *service copy* behind a JS
  interaction, which cost both conversions and crawlable text.
- Nothing breaks if JavaScript fails; it degrades to a scrollable row.
- `prefers-reduced-motion` disables snapping.

Card width is `clamp(255px, 80%, 400px)`, chosen so the next card always peeks
past the right edge — that peek is the affordance telling people it scrolls,
which is why there is no "swipe →" label. On desktop the three cards total more
than the 1120px container, so it scrolls there too.

Core applies `flex-basis:100%!important` to columns below 782px, so the carousel
rule needs both `!important` and higher specificity to win on mobile. Keep that
if you edit it.

If you want arrows, dots, or autoplay, those need JavaScript — say so and I can
add a small vanilla script. Autoplay is worth avoiding: it hurts accessibility
and reliably reduces engagement.

### If the carousel does not scroll

The site runs WP Rocket 3.10.7 with **Remove Unused CSS enabled**
(`remove_unused_css: 1`), alongside CSS minify and concatenate. RUCSS builds a
stripped stylesheet per URL and caches it. A CSS-only change does not always
invalidate that cache, so newly added Customizer rules can be missing from the
served page while being present in the database.

Order of things to try:

1. Hard-refresh logged out (`Cmd/Ctrl+Shift+R`). WP Rocket has
   `cache_logged_user: 0`, so a logged-in view and a logged-out view are served
   very differently.
2. Purge WP Rocket. Saving any change to the page also purges that URL.
3. If it still does not scroll, add `.lt-irr` to **WP Rocket → File Optimization
   → Remove Unused CSS → safelist**, or toggle RUCSS off briefly to confirm it
   is the cause. Safelisting only ever preserves CSS, so it cannot break
   anything else.

The `wp_rocket_settings` option was deliberately **not** edited from here.
`update_option` replaces the whole array, and a mistake would silently reset
every WP Rocket setting on a live site. Adding one safelist entry through the
plugin UI is the safe path.
