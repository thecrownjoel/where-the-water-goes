# Governance

Where the Water Goes is a small open-source project with a lead maintainer and room for more
maintainers. This page explains who decides what, how to become a maintainer, and how the project
keeps going if people step away.

## Roles

- **Contributors:** anyone who opens an issue, tests a build, or sends a pull request.
- **Maintainers** (listed in [MAINTAINERS.md](MAINTAINERS.md)) can merge pull requests, triage
  issues, and cut releases.
- **Lead maintainer:** a maintainer who also holds the repository's admin rights and settles
  disagreements that discussion doesn't.

## How decisions are made

- **Most changes:** a pull request with passing CI and one maintainer's approval. A maintainer may
  merge their own small fixes after 48 hours without objection.
- **Changes to the data-integrity rules** (CONTRIBUTING.md's "ground rules", how values are labelled,
  what counts as live, how locations are rounded): open an issue first and wait for the lead
  maintainer's approval. These rules are the project's reason to exist.
- **New data sources:** need their terms checked and recorded in `src/data/registry.ts` and
  `docs/DATA_SOURCES.md` before merging. A source that isn't public domain needs its credit in
  `NOTICE` and the About panel.
- **New network origins:** need a matching change to the Content Security Policy in both
  `src-tauri/tauri.conf.json` and `macos-saver/Sources/WhereTheWaterGoesView.swift`, and a line in
  `docs/PRIVACY.md`.

## Becoming a maintainer

There's no fixed quota. Typical paths:

- a few merged pull requests that show care for the ground rules, or
- verified platform testing (for example a full [TESTING.md](docs/TESTING.md) pass on Windows or
  Linux) plus a fix or two.

Any maintainer can nominate someone in an issue; the lead maintainer confirms. New maintainers get
write access and a line in MAINTAINERS.md. Maintainers who are away for six months move to
"emeritus" and can come back by asking.

## Releases

Any maintainer can cut a release with [docs/RELEASING.md](docs/RELEASING.md). Releases are built by
CI as drafts; a maintainer tests the files and publishes. Signing identities (Apple Developer ID,
Windows code-signing certificate) belong to whoever pays for them; they are stored only as GitHub
Actions secrets and are never committed.

## Continuity

So the project doesn't depend on one person:

- **Everything needed to build and release is in the repository.** The only outside pieces are the
  ones listed under "Accounts and secrets" below.
- **When there are two or more active maintainers,** the lead maintainer will move the repository
  to a GitHub organization so that admin rights are shared.
- **If the lead maintainer is unreachable for 90 days** (no response to an issue that mentions them
  and to a direct message), the other maintainers may pick a new lead among themselves and ask
  GitHub Support to transfer the repository, pointing to this paragraph as the lead's prior consent.
- **Handing over:** transfer the repository (Settings → Transfer), give the new owner admin on any
  organization, remove old Actions secrets, and update MAINTAINERS.md. The new owner sets up their
  own signing identities; certificates are never handed over.

## Accounts and secrets

| What | Status | Notes |
|---|---|---|
| GitHub repository | `thecrownjoel/where-the-water-goes` | Admin: lead maintainer |
| Actions secrets for signing | none yet | See RELEASING.md; each platform switches on when its secrets exist |
| Apple Developer Program | not enrolled | Needed for notarized macOS builds ($99/year) |
| Windows code-signing certificate | none | OV or Azure Trusted Signing |
| `wherethewatergoes.org` domain | not owned | The app ID `org.wherethewatergoes.app` assumes it; Flathub requires a domain or code host you control (see RELEASING.md) |
| Project email | none | Conduct and other private reports go through GitHub (see CODE_OF_CONDUCT.md) |
| CoCoRaHS | no agreement needed (CC BY 4.0) | The maintainers intend to tell CoCoRaHS about the app and its request volume; see docs/DATA_SOURCES.md |
