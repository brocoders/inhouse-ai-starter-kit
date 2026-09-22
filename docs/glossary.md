# Words you will meet

Every guide links here the first time it uses one of these. Five words where
five words do; a sentence where it matters.

- **Repository (repo)** — the folder with all of your app's files and their
  complete history, stored on GitHub and on your computer.
- **Commit** — one saved step in that history, with a note saying what changed.
- **Branch** — a parallel line of work in the repository; merged into `main`
  when it is ready.
- **Pull request (PR)** — "please merge this branch": the place where a change
  is reviewed before it joins `main`.
- **CI** — checks that run automatically on GitHub for every change:
  formatting, tests, build. Green means it passed.
- **Release** — putting a specific commit onto your server so people use it.
- **Migration** — a recorded change to the database's shape (a new table, a
  new column). Applied once, in order, never edited afterwards.
- **Server / VPS** — a rented computer that runs your app around the clock.
- **Docker / Compose** — the way the app, the database and the web front door
  run on the server as three sealed boxes started together by one file.
- **Domain / DNS** — your address on the web and the record that points it at
  the server's number.
- **HTTPS** — the padlock; the server proves it is yours and encrypts traffic.
  Caddy, the front door, arranges the certificate by itself.
- **PWA** — a web app that installs on a phone's home screen and behaves like
  an app.
- **API** — the part of the app the screens talk to; every screen action is a
  request to it.
- **Database** — where the records live. Postgres on the server; a small
  built-in one on your laptop while developing.
- **Backup / restore** — a nightly copy of the database, and the practised way
  of bringing it back.
- **Environment file (.env)** — the file of secrets and settings the app reads
  at start; never in the repository.
- **Token** — the unit AI models read and write in; plans are measured in
  them. A page of text is about 500 tokens.
- **Context** — everything the agent currently has in view; when it fills, the
  agent forgets and errs, so we keep it lean.
- **Skill** — a short playbook the agent loads for one kind of task.
- **Hook** — a script that runs automatically at a moment in the agent's work,
  such as formatting a file it just edited or blocking a dangerous command.
- **Worktree** — a second copy of the repository so two agents can work at once
  without colliding.
