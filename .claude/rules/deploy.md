---
paths:
  - 'deploy/**'
  - 'compose.yaml'
  - 'Caddyfile'
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

A repair to the server is code that goes out through a release, never a
command typed over `ssh`: the release is recorded and repeatable, the
command is neither. In a script, install the cleanup trap before the first
step that leaves anything behind; a cleanup written at the end of the happy
path runs only on success, and twenty-one abandoned build folders once
filled a disk that way.
