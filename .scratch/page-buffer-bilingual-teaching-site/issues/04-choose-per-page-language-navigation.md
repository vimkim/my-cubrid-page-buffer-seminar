# Choose per-page language navigation

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

Should each page link directly to its language counterpart, rely only on the root language selector, or use automatic locale selection? The recommended starting point is a visible `EN | KO` counterpart link on every page plus the root selector as fallback, with no forced locale redirect, so readers can switch context without losing their place.

## Answer

Put a visible `EN | KO` language control in a consistent location on every English and Korean teaching page. Each language option resolves directly to the same manifest-paired page in that language, preserving the reader's lesson or reference context. Identify the current language accessibly and make the counterpart an ordinary crawlable link. The root `index.html` language selector is the fallback entry, and the site must not force browser-locale redirects or store a choice that prevents later manual switching.
