# Contributing

Thanks for helping. The project has one non-negotiable rule: **never make data look more certain, more current or more official than it is.**

**Where to start:** [docs/ROADMAP.md](docs/ROADMAP.md) lists open work in priority order. The most valuable help right now needs no code: run [docs/TESTING.md](docs/TESTING.md) on Windows, Linux or macOS and file a *Platform test report*. [GOVERNANCE.md](GOVERNANCE.md) explains how decisions are made and how contributors become maintainers. Everyone follows the [code of conduct](CODE_OF_CONDUCT.md).

## Ground rules

- **Data:**
  - Every displayed value carries provenance and a `DataKind`.
  - Don't interpolate, smooth or fill values without a visible label and a documented method.
  - New sources go in `src/data/registry.ts` **and** `docs/DATA_SOURCES.md`, with endpoint, terms, attribution and limitations. Mark anything you couldn't confirm in official docs under `verify`.
- **No secrets or credentials in the client.** Don't add new network origins without updating the CSP in `src-tauri/tauri.conf.json` **and** `macos-saver/Sources/WhereTheWaterGoesView.swift`, plus `docs/PRIVACY.md`, and explaining why.
- **Other people's data:** sources that aren't public domain (CoCoRaHS is CC BY 4.0) keep their credit in `NOTICE` and the About panel. Volunteer locations stay rounded to about 1 km. Test fixtures use made-up stations.
- **Be polite to servers:** every layer is fetched at most every `refetchMs` and cached; don't shorten those intervals without a reason.
- **Visual changes:** keep reduced motion working (no camera flights, no glints) and keep text readable.
- **Agencies:** no agency logos, and no wording that implies endorsement.

## Development

```sh
npm install
npm run dev
npm test && npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
./scripts/build-macos-saver.sh                    # macOS: native .saver (then macos-saver/harness, see PLATFORMS.md)
node scripts/screenshot.mjs http://localhost:5173/ screenshots --wait=8000   # visual check
```

## Pull requests

- Keep them small.
- Add tests for parsing, validation, caching or calculations.
- Say how you verified the change, and on which OS.
