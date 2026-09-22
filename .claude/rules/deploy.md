---
paths:
  - "deploy/**"
  - "compose.yaml"
  - "Caddyfile"
---

# Server and release

Nothing here runs without the owner knowing. A release goes through
`deploy/release.mjs` and its gates only; never hand-run its steps on the
server. The server holds other things too: never restart, upgrade or
reconfigure anything outside this project's containers. Production data is
changed only by the app or by a migration; to investigate, `pnpm db:copy`
brings a copy down, and the `readonly` role over the SSH tunnel answers a
live question. Record every new system dependency in
`docs/server-requirements.md` in the same change.
