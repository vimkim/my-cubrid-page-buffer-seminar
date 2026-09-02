# Define bilingual HTML validation and parity gates

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

Which automated gates must pass before the bilingual site is accepted, including complete EN/KO page pairing, mirrored internal topology, resolved shared assets and Markdown evidence links, valid anchors, preserved source identifiers, correct `lang` and accessibility metadata, interactive-script behavior, safe SVGs, and live Copyparty rendering? The recommended starting point is one aggregate checker that discovers the root selector and both trees, fails on topology or identifier drift, and adds HTTP and live-DOM gates when Copyparty and browser automation are available.

## Answer

Use structural parity plus targeted technical-invariant parity, with human review for Korean naturalness. Do not require normalized EN/KO DOM or sentence-level equality: that would conflict with decision 05 by making natural restructuring fail validation. The weaker alternative—checking only links and page counts—would not protect exercise behavior or source traceability.

Add one bilingual teaching-site aggregate checker, with fixture-based tests for each failure class. It must establish these gates:

1. **Inventory and manifest:** require exactly one root language selector and exactly 41 manifest entries. Every entry names one existing `en/` page and one existing `ko/` counterpart at the same path below its language root. Reject missing, duplicate, extra, or cross-paired teaching pages. Recognize legacy redirect stubs separately so they cannot satisfy a page-pair entry.
2. **Document identity and navigation:** require `lang="en"` on English pages and `lang="ko"` on Korean pages; require the consistent `EN | KO` control to target the manifest-paired counterpart; require the root selector to target both course entries; and reject forced locale redirects. Check unique IDs and every same-document or relative fragment target.
3. **Link and asset closure:** resolve every relative HTML, CSS, JavaScript, image, favicon, and shared Markdown Evidence-reference target from its actual nested location. External links are syntax-checked but need not be network-fetched. Require displayed SVGs to resolve to the root `assets/` seam, retain `viewBox`, and contain no active or remote content. Require current legacy URLs to resolve only through the redirect-stub policy from decision 01.
4. **Technical invariants:** compare each page pair's code/preformatted content, source URLs, pinned hashes, source filenames and line anchors, element IDs, classes used by scripts, `data-*` attributes, imported script roster, form/control structure, and machine-readable answer values. Allow translated visible prose and reordered prose containers, but reject identifier, attribution, or exercise-contract drift.
5. **Language and accessibility:** reject unintended Korean prose in `en/` pages and shared SVG text; require meaningful Korean reader-facing content in every `ko/` page; require localized titles, search descriptions, navigation labels, form help, placeholders, feedback, and accessibility names. Treat jargon choice and naturalness as a recorded human-review gate because a mechanical language detector cannot prove either one.
6. **Static behavior:** load every page in a DOM-capable test environment, execute its common and inline scripts, and exercise each supported interactive control contract. Fail on uncaught exceptions, missing selectors, invalid answer-key wiring, broken local-storage scoping, or a language switch that loses page identity.
7. **Served behavior:** when a Copyparty base URL is supplied, request the selector, both complete page trees, redirect stubs, and all local dependencies. When browser automation is available, require successful navigation, no relevant console/page error, nonzero rendered image dimensions, and smoke interaction on each distinct exercise pattern. Report HTTP or live-DOM validation as `UNAVAILABLE`, never `PASS`, when its prerequisite is absent.
8. **Regression entry points:** keep the canonical Markdown maintainer-guide checker intact and run it alongside the new HTML checker. Changes to the bilingual checker must run its own Node test suite; the final migration gate runs both aggregate checkers and their tests.

Acceptance output must report discovered counts and a named result for every gate, so a narrow pass cannot be mistaken for whole-site validation.
