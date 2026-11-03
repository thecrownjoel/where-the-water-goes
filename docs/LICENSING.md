# License recommendation

**Code: Apache License 2.0** (provisional, pending the maintainer's confirmation).

- **Why Apache-2.0 over MIT:** it is just as permissive, but adds an explicit patent grant and a NOTICE mechanism for carrying data attributions. Universities and agencies are used to it, and it matches much of the Rust/Tauri ecosystem.
- **Why not GPL or AGPL:** they would discourage reuse in agency and university tools, and strong copyleft has nothing to protect here, since there is no service.
- **Tradeoff:** anyone may build a closed fork. If preventing that matters more than adoption, choose MPL-2.0 (file-level copyleft) instead.

**Data:**
- Bundled USGS-derived and Natural Earth-derived files stay in the public domain.
- ETOPO1-derived elevation follows NOAA's terms: free use and redistribution, not for legal use, no warranty.
- Attributions are listed in `NOTICE` and `docs/DATA_SOURCES.md`.

**Documentation:** included under Apache-2.0 for simplicity. CC-BY-4.0 is a reasonable alternative if docs will be reused separately.
