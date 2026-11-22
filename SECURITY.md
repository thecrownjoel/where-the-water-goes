# Security policy

## Reporting

Please report vulnerabilities privately through GitHub Security Advisories on this repository, not in public issues. We aim to acknowledge reports within 7 days.

## Design

- **No remote code.** The app runs only code bundled at build time. Data is parsed as JSON or CSV and validated field by field; malformed records are dropped and counted.
- **Content Security Policy** (`src-tauri/tauri.conf.json`):
  - `script-src 'self'`
  - network access only to `api.waterdata.usgs.gov` and `data.cocorahs.org` (also enforced by the macOS `.saver`, which serves its own copy of the policy)
  - `object-src 'none'`, `form-action 'none'`
- **Size limits:** responses over 40 MB are rejected.
- **Escaping:** HTML is escaped before insertion.
- **Native commands:** only `exit_saver`, `power_state`, `open_external` (https URLs only), `boinc_status` (read-only requests to BOINC on 127.0.0.1; never reads BOINC's password file) and `diag` (prints to stderr only when `WTRSHD_DIAG=1`). Tauri capabilities are limited to `core:default`.
- **No secrets** in the client, and no accounts.
- **Signing:** release builds should be signed (macOS Developer ID plus notarization; Windows Authenticode). Unsigned development builds trigger OS warnings.
