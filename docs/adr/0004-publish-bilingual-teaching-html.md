# Publish the teaching HTML in English and Korean

Keep the canonical Markdown maintainer-guide document set English-only under ADR 0002, while publishing every teaching HTML page as a paired `en/` and `ko/` page. English HTML is the canonical content source. Korean HTML uses natural Korean explanatory prose while retaining established database/CUBRID jargon, evidence labels, code, and source identifiers in English.

The root `index.html` becomes a language selector, every paired page has a direct `EN | KO` counterpart link, shared SVGs remain English, and a manifest plus validation gates protect page pairing, source traceability, interaction behavior, and translation-review state. This adds translation and drift-review cost, but gives Korean maintainers a natural learning route without weakening the one-language canonical guide or creating a second implementation-claim authority.

## Consequences

The teaching site has 43 pages in each language tree. Reader-facing JavaScript messages must be localized without duplicating interaction logic. Existing lesson and HTML-reference URLs redirect to their English counterparts for at least 90 days after cutover. A Korean-capable human review, recorded against exact EN/KO fingerprints, is required before a pair is current.
