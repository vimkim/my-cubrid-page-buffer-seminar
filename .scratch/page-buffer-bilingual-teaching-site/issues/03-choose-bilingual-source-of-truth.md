# Choose the bilingual source-of-truth model

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

How should future edits keep the English and Korean page trees aligned: treat English as canonical with an explicit counterpart manifest, maintain both trees as equal hand-authored sources, or generate both from a shared content model? The recommended starting point is English-canonical hand-authored HTML with a manifest that pairs every English and Korean page and records translation-review state, because it adds drift control without first rebuilding the course around a new generator.

## Answer

Treat the English HTML tree as the canonical content source. Keep the Korean tree as a natural-language translation maintained alongside it rather than generating either tree from a new content model. Add a machine-readable manifest with exactly one entry for every teaching page; each entry pairs the English and Korean paths and provides the metadata needed to determine whether the Korean translation has been reviewed against the current English source. The manifest is structural and review metadata, not a duplicate store of page content.
