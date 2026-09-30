# Ticket 03 policy contract and source review

Participant entry is `lessons/0007-replace-one-frame.html#first-principles` in each language, following ticket 02 concurrency. The stop includes `story`, `one-list`, `pool-map`, `admission`, `private-shared`, `design-assumptions`, `session-age`, `zones`, `aging`, `reuse`, `migration`, and `quota`. Exit from `quota` into ticket 04's unchanged `list-choice`. All pre-existing IDs remain. `admission` is a focused cue inside the stop, not the whole-stop entry. Full-curriculum previous/next links remain untouched.

`03-spoken.html` contains the full Korean delivery segment. Its root-relative-by-placement `ko/...` cues are intentionally for insertion into root `my-presentation-script.html`; ticket 07 must resolve them there and include them in standalone-script testing. It is a contribution fragment, not another current presenter companion.

The admission worked example is a separate, explicitly labeled state: B carries PB; an ordinary clean S1 becomes resident in VOID while fixed, then enters PB top/LRU1 at eligible BCB-wide final unfix. Positive thresholds have room; no waiters, special path, quota adjustment or waiting allocator intervenes. Immediate same-context fix/unfix with registered-fix count below hot threshold keeps S1 at the same position, clean, resident, `fcnt = 0`, same identity/BCB/frame. It predicts no victim and no timing/performance result.

Ticket 02 vocabulary received and applied: a context's last release and BCB-wide zero crossing are different. Ordinary placement is subject to additional branch conditions; zero does not imply flush, eviction or commit. Exact producer commit will be recorded in the checks receipt once delivered.

The local PA/PB migration example explicitly uses different domains. Ticket 04's full-pool branch deliberately resets assignments so A and B share private index 32. Multiple contexts sharing one private list is valid; neither example makes private membership an access prohibition. No branch outcome is inferred from the earlier isolated admission arithmetic.

## Pinned-source checks

Reviewed the exact Git blob using `git -C /home/vimkim/gh/cb/pgbuf-grill show f799e05d77d5300c6ea5753b4a6cc7caee6d8912:src/storage/page_buffer.c`. This avoids relying on working-tree observation patches. These are constructed/source-derived states, not runtime receipts.

- Lines 6675–6748: decrement global count, reset latch at zero, move-to-bottom precedence, reader/writer waiter gate, then VOID dispatch.
- Lines 6885–6994: AOUT-disabled ordinary private top/LRU1 versus no-private shared middle/LRU2 admission.
- Lines 6742–6844 and 6996–7038: migration checked before same-list policy; actual final context index mismatch or hot-and-old. Shared does not imply several simultaneous readers.
- Lines 1052–1058: wrap-aware age difference against integer `count_lru2 / 2`; 100→110 gives 10 versus cutoff50; 100→150 gives50 and passes (no wrap).
- Lines 9694–9830 and 10200–10296: top/middle list tick advancement and BCB saved tick; do not equate quota epochs with position ticks.
- Lines 10123–10197: same-list eligible boost from LRU2/3, not LRU1; zone adjustment follows insertion.
- Lines 14400–14511: quota target differs from list length, cap at5000 and half-pool, private thresholds integer quota×0.05. Quota2000 gives100/100, actual length4000 gives3800 LRU3 when both thresholds filled. This isolated snapshot is not ticket04's branch checkpoint.
- Lines 16580–16610: quota activity registration at most once per BCB per epoch.

During direct coordination, caught ticket04's draft per-list quota16384 before acceptance; the owner corrected to cap5000 and250/250 thresholds. Root independently reviewed the corrected arithmetic.

## Historical observation disposition

The paired `03-volmap-*-historical.html` fragments preserve removed participant-facing conversation text as author evidence, including the old viewer path and all limitations. They report an unreproduced observation with no exact server/workload/capture; they are not a new runtime receipt. Participant pages now retain independently source-verified rules, without this private review path or conversational residue.

The existing manifest entry already has `review.state = pending` and empty fingerprints for 0007. There is no valid old receipt to invalidate, so leave the entry unchanged. No human review is claimed.
