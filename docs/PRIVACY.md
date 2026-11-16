# Privacy and data retention

- **No telemetry, analytics, accounts or identifiers.** The app does not contact any project server.
- **Network traffic:** the only runtime requests go to `api.waterdata.usgs.gov`: three small queries (streamflow and lake levels at most hourly, rain at most every 30 minutes). The webview's Content Security Policy blocks every other origin. USGS sees your IP address, as with any website.
- **Stored locally:**
  - Settings (browser localStorage in the app's webview profile).
  - The latest USGS snapshots, one per layer (IndexedDB). They contain only public agency data. Entries older than 7 days are purged at startup.
  - Settings → **Clear cached data** deletes the cache immediately.
  - Uninstalling the app and deleting its data directory removes everything. On macOS that directory is `~/Library/WebKit/org.wherethewatergoes.app` and `~/Library/Application Support/org.wherethewatergoes.app`, depending on the webview (**verify per platform**).
- **Diagnostics** (`WTRSHD_DIAG=1`) print to your terminal only.
- **BOINC status (desktop app only):** once a minute the native shell connects to `127.0.0.1:31416`, the BOINC client's local control port on your own computer, and asks for read-only status. If BOINC isn't installed, the connection is simply refused. The status never leaves your machine, and the app doesn't read BOINC's password file. What BOINC itself sends to the research projects you attach it to is governed by BOINC and those projects.
