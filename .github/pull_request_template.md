## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## How I verified it

<!-- Tests added or run, screenshots, and which OS you ran it on. -->

## Checklist

- [ ] `npm test` and `npm run typecheck` pass (and `cargo test` if Rust changed)
- [ ] Displayed values still show their source, kind and time; nothing looks more certain, current or official than it is
- [ ] New data sources are in `src/data/registry.ts` and `docs/DATA_SOURCES.md`, with credit in `NOTICE` if not public domain
- [ ] New network origins are in both CSPs (`src-tauri/tauri.conf.json`, the macOS `.saver`) and `docs/PRIVACY.md`
- [ ] Reduced motion still works
