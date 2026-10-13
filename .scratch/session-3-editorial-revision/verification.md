# Editorial design verification

This receipt covers the [design proposal](design.md) and [section disposition map](section-plan.json) for work item 354 on 2026-10-13. Final shared understanding and local integration approval remain pending. It verifies the plan as an author artifact; implementation/browser acceptance is subsequent work.

## Revision and scope

- Repository baseline: `bedae28232ff59439b34a58bf8e2932f4a19d1c5`.
- Checkout: `/home/vimkim/gh/my-cubrid-page-buffer-seminar-editorial-design`.
- Branch: `docs/session-3-editorial-design`, based on local `main`.
- Author artifacts: design, disposition map, and this receipt.
- The EN/KO audience files, contents, spoken scripts, validators, and source files match the baseline in this checkout.

## Results

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Copyparty Markdown source | PASS | The configured source checker accepts the design and this receipt. |
| Relative links and fragments | PASS | The design's 14 relative targets, including Markdown/HTML fragments, resolve. Receipt links resolve to the local plan/map. |
| Disposition completeness | PASS | All 119 current section IDs have exactly one entry; current EN/KO section order matches. |
| Retained ownership | PASS | All 62 proposed owners exist and are unique within their route; every merge/disclosure/link owner is retained. Proposed per-chapter counts are 15/9/14/12/12. |
| Calculation premises/source | PASS | Local CUBRID worktree HEAD is `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. Inspected rate, smoothing, quota, threshold, private-call guard, and zone-adjustment code plus relevant constants. |
| Calculation arithmetic | PASS | Source-order integer truncation and IEEE float32 arithmetic yield rates 900/100, activity 700/300, private budget 5,000, quotas 3,500/1,500, private thresholds 175/75 each, and shared thresholds 500/62. Added zone snapshot preserves 2,000 resident entries and yields 75/75/1,850. |
| Maintainer Guide source aggregate | PASS | 43 Markdown pages; relative links; 71 displayed SVGs, zero orphaned SVGs; English prose. |
| Bilingual source aggregate | FAIL: existing review gate | 78 missing Korean review receipts and 96 stale fingerprints; zero other diagnostics. Audience files and manifest are unchanged in this design-only diff, so these are baseline review failures. |
| Copyparty HTTP / live DOM | UNAVAILABLE | Source aggregates were run without a checkout-mounted `--copyparty-url`; no served-byte or rendered acceptance is claimed. |
| Engine runtime / participant acceptance | Not performed | Source reasoning and constructed arithmetic are not runtime measurements or participant evidence. |

Focused plan checks use the current baseline's section IDs as an independent inventory, require every disposition exactly once, require every owner to be retained, and validate the sums. These are design audits, not tests asserting that the future implementation must achieve a fixed section count.

## Reproduction and future checks

Run the configured checker on both Markdown files and inspect `git diff --check`. The source aggregate commands are:

```sh
node scripts/check-maintainer-guide.mjs
node scripts/check-bilingual-teaching-site.mjs
```

The implementation must run the existing Session 3 tests and served/browser gates, including disclosed-trace access and every former standalone fragment. The [design's completion rules](design.md#verification-and-completion) retain those requirements. Human review remains distinct from automated checks.
