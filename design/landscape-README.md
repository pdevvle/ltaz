# Landscape Design page — ready to apply

**Not yet on the site.** The Lee's Trees connector dropped out of this chat
(`enabledInChat: false`), so nothing could be created in WordPress. These two
files are the finished page, ready to push the moment it is reconnected.

| File | Goes where |
|---|---|
| `landscape-design-page.html` | `post_content` of a new page |
| `landscape-page.css` | appended to Appearance → Customize → Additional CSS |

Intended page: title **Landscape Design & Installation**, slug
`landscape-design-redesign`, plus the same Astra meta as the irrigation page
(`site-sidebar-layout=no-sidebar`, `site-content-layout=page-builder`,
`ast-title-bar-display=disabled`, `ast-featured-img=disabled`).

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

## Two things needed from you

1. **The Google review you linked** — `share.google` is blocked by this
   environment's egress policy, so paste the text, rating, date and name and it
   becomes a fourth review card.
2. **Page 950's original copy.** "Take inspiration from the original" was done
   from its excerpt only, since the connector dropped before it could be read.
   Worth a diff once reconnected in case it names services or claims this page
   is missing.

Also unverified: `Jamie S.` (from page 1855) reads as a strong landscape review
and was left out on purpose. The excerpt truncates right after the name, and the
sibling Storm Cleanup page attributes its review to **Home Advisor**, not Google
— so putting Jamie S. under a "on Google" heading could be wrong. Confirm the
source and it goes in.
