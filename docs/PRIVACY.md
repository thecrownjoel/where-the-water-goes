# Privacy and data retention

- **No telemetry, analytics, accounts or identifiers.** The app does not contact any project server; the project has none.
- **Network traffic:** runtime requests go to two places only, and the webview's Content Security Policy blocks every other origin:
  - `api.waterdata.usgs.gov`: four small queries (streamflow and lake levels at most hourly, rain at most every 30 minutes, groundwater at most every 3 hours).
  - `data.cocorahs.org`: the CoCoRaHS daily rain reports, two requests at most every 6 hours.
  - Each service sees your IP address, as with any website. Nothing about you is sent: the requests are the same for everyone.
- **Volunteers' privacy:** CoCoRaHS publishes each station's location precisely. This app rounds it to about 1 km as soon as it is parsed and never stores the precise value.
- **Stored locally:**
  - Settings (browser localStorage in the app's webview profile).
  - The latest snapshot of each layer (IndexedDB): public USGS data and CoCoRaHS reports (with rounded locations). Entries older than 7 days are purged at startup.
  - Settings → **Clear cached data** deletes the cache immediately.
  - Uninstalling the app and deleting its data directory removes everything. On macOS that directory is `~/Library/WebKit/org.wherethewatergoes.app` and `~/Library/Application Support/org.wherethewatergoes.app`, depending on the webview (**verify per platform**).
- **Diagnostics** (`WTRSHD_DIAG=1`) print to your terminal only.
- **BOINC status (desktop app only):** once a minute the native shell connects to `127.0.0.1:31416`, the BOINC client's local control port on your own computer, and asks for read-only status. If BOINC isn't installed, the connection is simply refused. The status never leaves your machine, and the app doesn't read BOINC's password file. What BOINC itself sends to the research projects you attach it to is governed by BOINC and those projects.
