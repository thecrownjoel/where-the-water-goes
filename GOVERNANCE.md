# Governance

Where the Water Goes is a small open-source project with a lead maintainer and room for many
more. **Anyone can contribute, and anyone who sticks around can take over.** This page explains
who decides what, how write access and the lead role are handed out, and how the project keeps
going if people step away.

## Roles

- **Contributors:** anyone who opens an issue, tests a build, or sends a pull request. No
  permission needed.
- **Committers:** anyone who has had a pull request merged and asked for write access. They can
  review, label and merge other people's pull requests.
- **Maintainers** (listed in [MAINTAINERS.md](MAINTAINERS.md)) are committers who also own an area,
  approve changes to the data-integrity rules, and prepare releases.
- **Lead maintainer:** holds admin rights, pushes release tags, approves the signing step, and
  settles disagreements that discussion doesn't.

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

## Open commit access

**Once you've had one pull request merged, you can ask for write access**: say so in the pull
request or in an issue. The lead maintainer grants it unless there's a concrete reason not to.
This is deliberate: a project with one maintainer needs more hands, and the guardrails below make
it safe to hand out keys freely.

**Guardrails** (repository rulesets and a protected environment, so they don't depend on trust):

- Nobody pushes straight to `main`. Every change, including a committer's own, goes through a pull
  request with passing CI and an approval from someone else.
- `main` can't be force-pushed or deleted.
- Only the lead maintainer can create release tags (`v*`).
- Signing secrets live in the `release` environment, which runs only from `main` or a release tag
  and waits for the lead maintainer's approval. Write access alone can't reach them.
- Releases are built as drafts; nothing is public until someone tests the files and publishes.

Committers who are away for six months lose write access quietly and get it back by asking.

## Becoming a maintainer

Typical paths: a few merged pull requests that show care for the ground rules, or verified
platform testing (for example a full [TESTING.md](docs/TESTING.md) pass on Windows or Linux) plus a
fix or two. Any committer can nominate someone in an issue; the lead maintainer confirms.
Maintainers who are away for six months move to "emeritus" and can come back by asking.

## Taking over the project

The lead role is meant to be handed on, not held forever.

- **Want to lead it?** Open an issue titled "Adoption: <your name>" saying what you'd like to do.
  After a few months of active maintenance, the lead maintainer hands over admin rights, release
  tagging and the signing environment using the handover checklist below.
- **Forks are always fine.** The code is Apache-2.0: anyone may fork the project and continue it
  without asking. If you publish builds of a fork, please use a different name, app ID
  (`org.wherethewatergoes.app`) and screensaver file name so users' installs don't collide, and
  keep the data credits in `NOTICE`.

## Releases

Maintainers prepare a release (version bump pull request, TESTING.md results); the lead maintainer
pushes the tag and approves the signing step ([docs/RELEASING.md](docs/RELEASING.md)). Releases are
built by CI as drafts; someone tests the files and publishes. Signing identities (Apple Developer
ID, Windows code-signing certificate) belong to whoever pays for them; they are stored only as
secrets of the `release` environment and are never committed.

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
| `release` environment | created; required reviewer: lead maintainer; runs from `main` and `v*` tags only | Signing secrets go here (none yet). See RELEASING.md |
| Rulesets | `main`: pull request + 1 approval + CI, no force-push or deletion; `v*` tags: admins only | Admins can bypass, for emergencies |
| Apple Developer Program | not enrolled | Needed for notarized macOS builds ($99/year) |
| Windows code-signing certificate | none | OV or Azure Trusted Signing |
| `wherethewatergoes.org` domain | not owned | The app ID `org.wherethewatergoes.app` assumes it; Flathub requires a domain or code host you control (see RELEASING.md) |
| Project email | none | Conduct and other private reports go through GitHub (see CODE_OF_CONDUCT.md) |
| CoCoRaHS | no agreement needed (CC BY 4.0) | The maintainers intend to tell CoCoRaHS about the app and its request volume; see docs/DATA_SOURCES.md |
