# Choose the Korean visual-asset boundary

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

Should Korean pages reuse every existing English SVG, receive Korean variants for text-bearing SVGs only, or localize all visual assets? The recommended starting point is shared CSS, JavaScript, and language-neutral visuals plus Korean variants only for SVGs whose embedded prose materially affects comprehension; canonical source identifiers inside visuals remain English.

## Answer

Reuse the existing English SVGs unchanged in both language trees. Keep every displayed SVG in the root `assets/` seam and adjust only the relative references required by the extra `en/` or `ko/` nesting. Do not create Korean SVG variants. Korean prose surrounding a visual may explain its English labels, but must not duplicate or modify the canonical diagram content.
