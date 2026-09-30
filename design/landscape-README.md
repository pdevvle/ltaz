# Landscape Design page

**Live.** Page ID **1993**, slug `landscape-design-redesign`, status
**published**: https://leestreesaz.com/landscape-design-redesign/

| File | Mirrors |
|---|---|
| `landscape-design-page.html` | `post_content` of page 1993 |
| `landscape-page.css` | the `.lt-land` block appended to Customizer Additional CSS |

Astra meta set as on the irrigation page: `site-sidebar-layout=no-sidebar`,
`site-content-layout=page-builder`, `ast-title-bar-display=disabled`,
`ast-featured-img=disabled`.

The existing **Landscape Design draft (page 950) stays untouched** — it is
unpublished, so unlike the irrigation job there is no live page to compete with.

## Layout

1. **Hero** — full-bleed photo cover, 3.4rem display headline, free-visit CTA,
   and a Google reviews link pill immediately under the buttons.
2. **Reviews** — full-bleed dark green band, *second section on the page*. This
   is the "prominent" part: social proof sits above every service description.
   Three Google reviews in a scroll-snap carousel.
3. **What we build** — four photo service cards (full-yard design, sod & turf,
   pavers & hardscape, trees & cleanup), with irrigation, rock and storm cleanup
   named in a follow-on line.
4. **How it goes** — three CSS-counter numbered steps.
5. **Book your free design visit** — near-black panel, `#quote` anchor, the
   existing Elementor form 155 by shortcode.
6. **Related services** — inline links.

## Design direction

A separate `.lt-land` scope rather than a reuse of `.lt-irr`. The irrigation
page is a service-card look; "sleek modern" here means more whitespace, larger
display type, hairline rules, pill buttons, 10–14px radii and a tighter palette.
Sharing selectors would have meant fighting them. Brand tokens are identical —
Barlow, uppercase tracked headings, `#2E6E36`, `#FA9046`, with `#D2FA52` (Lee's
Palo Verde) used for eyebrow text on dark grounds.

Carries over from the irrigation page: the `<details>` call popup (desktop hides
the number, mobile keeps the tel: button and sticky footer), `tel:6234005499`
exactly as the GTM trigger expects, and the same GTM hook
`.lt-callpop summary, .lt-callpop summary *`.

## Built from the original (page 950)

Page 950 turned out to be far richer than its excerpt, and it supplied most of
what makes this page specific rather than generic:

- **A landscape-specific Google review from Solitaire P.**, full text, with the
  original's own link to the listing (`g.co/kgs/P8r2Vp`). This is now the first
  card in the reviews carousel — it names Mid-Iron sod, pavers, white and black
  rocks, tree trimming and a new sprinkler system, which is a far better proof
  of "whole yard" than anything written from scratch.
- **The real service taxonomy** — Tearouts, Groundwork, Foliage, Accents — with
  the original's bullet lists kept nearly verbatim, and its line "We don't need a
  clean slate to work our magic. We can make one."
- **Four genuine differentiators** now in a hairline row under the section lede:
  HOA-agreeable designs, desert-friendly water-efficient planting, no
  sub-contractors without prior approval, insured employees. These are real trust
  signals and none of them were in the first draft.
- Its H1 line "From the drawing board to the backyard" became the hero headline.
- Its srcset also gave verified derivative URLs for attachments **183** and
  **113**, which were previously unusable.

## Deliberately absent

**No star ratings and no aggregate score.** I do not have Lee's Trees' actual
Google rating or review count, and inventing "4.9 from 87 reviews" on a live
page would be a misrepresentation — it is also exactly the kind of thing Google
penalises. The hero links to the real Google listing instead. Once the Business
Profile feed is wired up, `starRating` arrives per review and stars can be
rendered from real data.

**No separate photo gallery.** Only five attachments have verified size
derivatives (114, 118, 110, 163, 221, 308 among the landscape-relevant ones) and
four are already used as service cards. A gallery would have repeated them. Once
reconnected, fetching `_wp_attachment_metadata` for 119, 113, 111 and the
remaining pavers/turf shots gives enough for a proper grid.

## Still needed from you

**The Google review you linked** — `share.google` is blocked by this
environment's egress policy, so paste the text, rating, date and name and it
becomes a fourth review card.

Also unverified: `Jamie S.` (from page 1855) reads as a strong landscape review
and was left out on purpose. The excerpt truncates right after the name, and the
sibling Storm Cleanup page attributes its review to **Home Advisor**, not Google
— so putting Jamie S. under a "on Google" heading could be wrong. Confirm the
source and it goes in.

## Also built from /new-landscaping-services/ (page 1855)

That page carried material the redesign was missing:

- **Three more Google reviews, with dates** — Jamie S. (April 2026), Michael L.
  (May 2026), Cheryl B. (April 2026). The carousel now runs **six** reviews,
  which is the point at which a carousel actually earns its place.
- **This settles the Jamie S. question.** It was held back earlier because the
  excerpt truncated at the name and a sibling page credited Home Advisor. Page
  1855 shows the full citation: *"Jamie S., April, 2026, via Google"*. It is a
  Google review and is now in the carousel.
- **The "Aspects of New Landscaping Installation" feature list** — design &
  planning, cleanups and removals, tree removal, pavers, turf installation, turf
  removal, decorative rock, irrigation installation. Rendered as a marker-less
  four-column list under the service cards.
- **Four landscape-specific FAQs**, kept close to the original wording: what work
  is performed, what drives cost (front vs front-and-back, yard size, new
  foliage, new pavers), the three-step free consultation, and timing — including
  that HOA approval can stretch product selection and that most yards finish
  within a few days.
- **"On-site or remotely, for free"** — remote planning was not mentioned
  anywhere in the redesign and is a genuine differentiator. Added to the hero.

The FAQ CSS uses `.wp-block-details:not(.lt-callpop)`, because the call popup is
also a `<details>` and must not inherit the hairline rules.
