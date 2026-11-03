# Contributing

Thanks for helping. The project has one non-negotiable rule: **never make data look more certain, more current or more official than it is.**

## Ground rules

- **Data:**
  - Every displayed value carries provenance and a `DataKind`.
  - Don't interpolate, smooth or fill values without a visible label and a documented method.
  - New sources go in `src/data/registry.ts` **and** `docs/DATA_SOURCES.md`, with endpoint, terms, attribution and limitations. Mark anything you couldn't confirm in official docs under `verify`.
- **No secrets or credentials in the client.** Don't add new network origins without updating the CSP in `src-tauri/tauri.conf.json` and explaining why.
- **Visual changes:** keep reduced motion working (no camera flights, no glints) and keep text readable.
- **Agencies:** no agency logos, and no wording that implies endorsement.

## Development

```sh
npm install
npm run dev
npm test && npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
node scripts/screenshot.mjs http://localhost:5173/ screenshots --wait=8000   # visual check
```

## Pull requests

- Keep them small.
- Add tests for parsing, validation, caching or calculations.
- Say how you verified the change, and on which OS.
