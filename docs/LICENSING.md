# Licensing

**Code: Apache License 2.0.** Confirmed by the maintainer on 2026-11-22 when the project was opened to the public. The reasoning below is kept for the record.

- **Why Apache-2.0 over MIT:** it is just as permissive, but adds an explicit patent grant and a NOTICE mechanism for carrying data attributions. Universities and agencies are used to it, and it matches much of the Rust/Tauri ecosystem.
- **Why not GPL or AGPL:** they would discourage reuse in agency and university tools, and strong copyleft has nothing to protect here, since there is no service.
- **Tradeoff:** anyone may build a closed fork. If preventing that matters more than adoption, choose MPL-2.0 (file-level copyleft) instead.

**Data:**
- Bundled USGS-derived (including the principal-aquifer map) and Natural Earth-derived files stay in the public domain.
- CoCoRaHS data, fetched at run time and in the bundled archived snapshot, is **CC BY 4.0, © Colorado Climate Center**, not public domain. Anyone redistributing the app must keep its credit (About panel, `NOTICE`), and must not imply endorsement. The license does not cover CoCoRaHS's trademarks or logo; we don't use them.
- ETOPO1-derived elevation follows NOAA's terms: free use and redistribution, not for legal use, no warranty.
- Attributions are listed in `NOTICE` and `docs/DATA_SOURCES.md`.

**Documentation:** included under Apache-2.0 for simplicity. CC-BY-4.0 is a reasonable alternative if docs will be reused separately.
