# Page-journey structure recap

Baseline: `f799e05d77d5300c6ea5753b4a6cc7caee6d8912`. The local source worktree was clean at that commit. This change adds the same array/list SVG and count/size explanation to both Lecture 1 languages. The canonical object guide now explicitly distinguishes physical arrays from linked replacement order.

## Size evidence

Read-only GDB type inspection of the existing Linux x86-64 SERVER_MODE Debug object (no process was started or attached):

```sh
gdb -nx -q -batch /home/vimkim/gh/cb/pgbuf-grill/build_preset_debug_gcc/cubrid/CMakeFiles/cubrid.dir/__/src/storage/page_buffer.c.o \
  -ex 'p sizeof(PGBUF_BCB)' \
  -ex 'p sizeof(PGBUF_LRU_LIST)' \
  -ex 'p sizeof(PGBUF_BUFFER_POOL)' \
  -ex 'p (long)&((PGBUF_IOPAGE_BUFFER*)0)->iopage'
```

```text
$1 = 144
$2 = 128
$3 = 648
$4 = 8
```

Object SHA-256: `99c5ed6fb756253c5c439fcf2371eea4ad240ca5207c524a42f23f19103cd851`.

These are existing-build type-layout observations, not a fresh rebuild or runtime memory measurement. BCB fields and offsets were compared with the pinned structure definition. ABI and build options may change these sizes. `PGBUF_IOPAGE_BUFFER_SIZE` is an allocation stride, not `sizeof(PGBUF_IOPAGE_BUFFER)`: the page uses a variable payload. At a 16,384-byte I/O page size the stride is 16,392 bytes plus any CUBRID_DEBUG guard. The figure does not assert whether that separate option is enabled in every Debug build.

The source declares one static pool object per process. Its 648 bytes exclude pointed-to allocations. Default count derivations remain owned by `advanced/replacement-progress.md`: N = 32,768, S = 32, P = 152 assumes max_clients 100, HA off and automatic chain settings. Thus the BCB array is 4.5 MiB, the 184 LRU descriptors total 23 KiB, and frame page bytes alone total 512 MiB (plus 256 KiB back-pointers and any guards). Other allocations are excluded. The illustrative list links do not depict a captured runtime state.

## Verification

The worktree was served by a loopback-only Copyparty instance at `http://127.0.0.1:3942`. Browser checks used headless Chromium through `PLAYWRIGHT_MODULE=/home/vimkim/.cache/uv/archive-v0/4O6KYEhbJwMgh8m4qcuPa/playwright/driver/package/index.mjs`.

- `node scripts/check-maintainer-guide.mjs --copyparty-url http://127.0.0.1:3942`: PASS, 43 Markdown pages, 64 displayed SVGs, zero orphan assets, 107 HTTP resources and 43 live-DOM pages.
- `node scripts/check-bilingual-teaching-site.mjs --copyparty-url http://127.0.0.1:3942`: only the existing review gate failed (162 missing receipt/fingerprint reports across 54 active pairs); no other gate reported failures. Formal human EN/KO review remains pending; no review receipt was generated.
- Explicit `--gate served` run: PASS, 274 HTTP resources and 109 live-DOM pages, including responsive layout, disclosures, presentation and no-JavaScript checks.
- Focused headless review: the diagram rendered with nonzero natural dimensions; 1440px and 390px layouts had no document overflow. Both languages entered presentation mode. Desktop diagram screenshot inspected; adjusted the private-list connector to avoid passing through a BCB box.
- `git diff --check`: PASS. Validation code was not modified.
