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

Core only — `group`, `columns`, `column`, `heading`, `paragraph`, `buttons`,
`button`, `list`, `list-item`, `quote`, `details`, `shortcode`. There are no
`core/html` blocks and no page-builder dependency. The quote form is the existing
Elementor template (ID 155) pulled in through a `core/shortcode` block, so there
is still only one form to maintain.

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
