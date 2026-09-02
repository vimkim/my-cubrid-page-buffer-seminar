# Choose the legacy URL transition

Status: resolved
Label: wayfinder:grilling
Parent: [Bilingual Page-buffer Teaching Site](../map.md)
Blocked by: None

## Question

What compatibility guarantee should the migration make for existing `index.html`, `lessons/*`, and `reference/*` URLs: keep thin redirect or forwarding pages for a defined transition period, preserve them indefinitely, or intentionally break them at cutover? The recommended starting point is a defined transition period with redirect stubs, because existing bookmarks and deep links otherwise fail as soon as the files move.

## Answer

Keep thin compatibility redirect stubs for the current `lessons/*` and `reference/*` URLs during a defined transition period. Root `index.html` is intentionally replaced by the language selector and therefore is not a redirect. The implementation specification must set the transition duration and make removal of the stubs an explicit later cleanup, not an incidental side effect of the migration.
