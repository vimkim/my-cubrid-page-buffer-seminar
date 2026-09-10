# Seminar prototype review

The Korean prototype explored a curriculum landing page and a seven-section flush-generation lecture. The user accepted recommended layout A on 2026-09-08. Its throwaway code, including comparison variants, is archived on local branch `prototype/page-buffer-curriculum-layout-a`, commit `ea734afb749c31c6303aded2101f4a4885794ea1`. Production uses shared seminar styles and behavior, not the variant switcher.

## Question and variants

Which layout supports live projection and later independent reading of the same technical explanation?

- A: open reading layout with a curriculum list and a narrow lecture navigation rail.
- B: workspace layout with grouped curriculum cards and a prominent lecture navigation panel.
- C: full-width chapter sequence with larger openings and horizontal lecture navigation.

Use the floating arrows or left/right keys to compare variants. The URL preserves variant and view. Presentation mode focuses one lecture section; use its previous/next buttons or PageUp/PageDown. Escape returns to reading. Native details elements reveal explanations without scoring or answer storage. These prototype controls are not yet production components.

## Run

From the page-buffer-presentation directory:

```sh
python3 -m http.server 4331 --bind 127.0.0.1
```

To inspect the historical prototype, use a separate worktree of the archive branch and open `seminar-prototype.html?variant=A&view=curriculum` there. The active site is [the Korean curriculum](../ko/index.html); prototype files are no longer part of its working tree.

## Verification on 2026-09-08

Chromium checks passed for all three variants and both views at 1440px desktop width. All three lecture variants fit a 390px mobile viewport without horizontal document overflow. Presentation section navigation, reload state, checkpoint disclosure, local link HTTP responses, and image natural dimensions passed. No page JavaScript errors were observed. With JavaScript disabled all seven lecture sections remained visible. The default curriculum and lecture screenshots were inspected visually.

The maintainer-guide aggregate passed Markdown source, relative links, SVG ownership, English prose, and 103 Copyparty resources. Its built-in DOM gate could not resolve Playwright; the prototype was checked separately using the existing Playwright installation. The bilingual aggregate still fails its existing missing human Korean-review receipts and review fingerprints. The preview does not create review receipts or establish production readiness.

## Accepted decision

Layout A is accepted for continuous reading with optional focused presentation. The [coverage audit](curriculum-coverage.md) records the full bilingual rollout and its validation boundaries. Prototype approval is a layout decision, not a human language-review receipt for the whole collection.
