# Split the maintainer guide by reading mode

Replace the monolithic maintainer guide with a stable `page-buffer-teaching-material.md` guide entry and separate learning, playbook, and advanced pages, while retaining the existing evidence documents as references. This sacrifices single-file portability and requires document-set-aware link and asset validation, but prevents linear onboarding, issue-time lookup, advanced mechanisms, and evidence catalogs from competing inside one page; each concept will have one canonical explanation linked from the other routes.

## Consequences

The learning path has six pages covering the contract and objects, fix/hold/release, caller responsibilities, generation flush, frame replacement, and a maintainer capstone. Three playbooks own change, diagnosis, and verification workflows; five advanced pages own concurrency, replacement progress, recovery/lifecycle, specialized interfaces, and proof obligations; two compact references own source routing and the invariant index. `source-inventory.md` and `unresolved-or-version-sensitive-findings.md` retain their evidence roles. The old monolith is replaced in place by the guide entry rather than preserved as a parallel legacy document.
