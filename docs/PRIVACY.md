# Privacy and data retention

- **No telemetry, analytics, accounts or identifiers.** The app does not contact any project server.
- **Network traffic:** the only runtime requests go to `api.waterdata.usgs.gov`: three small queries (streamflow and lake levels at most hourly, rain at most every 30 minutes). The webview's Content Security Policy blocks every other origin. USGS sees your IP address, as with any website.
- **Stored locally:**
  - Settings (browser localStorage in the app's webview profile).
  - The latest USGS snapshots, one per layer (IndexedDB). They contain only public agency data. Entries older than 7 days are purged at startup.
  - Settings → **Clear cached data** deletes the cache immediately.
  - Uninstalling the app and deleting its data directory removes everything. On macOS that directory is `~/Library/WebKit/org.wherethewatergoes.app` and `~/Library/Application Support/org.wherethewatergoes.app`, depending on the webview (**verify per platform**).
- **Diagnostics** (`WTRSHD_DIAG=1`) print to your terminal only.
- **Volunteer computing** does not exist in this version. If it is ever added, it will be opt-in. Submitted results will contain only computed values and the code version, with a documented retention period.
