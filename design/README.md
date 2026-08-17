# Irrigation page redesign

A draft redesign of `/irrigation`, built as native Gutenberg blocks.

| | |
|---|---|
| Page | ID **1958**, slug `irrigation-redesign`, status **draft** |
| Preview | `leestreesaz.com/?page_id=1958` (requires login — drafts are not public) |
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

The page has not been viewed in a browser — drafts are not publicly fetchable, so
verification was structural only. Worth confirming in the preview:

1. The Elementor form renders cleanly inside the white panel on the dark section.
2. Mobile: four-column rows stack sensibly, buttons go full width.
3. No block shows an "unexpected or invalid content" notice in the editor.
