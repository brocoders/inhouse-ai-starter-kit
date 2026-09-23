# Running it

Four situations, from the one you do every day to the one you hope never to do.

1. [On your laptop](#on-your-laptop) — every day
2. [Your server, once](#your-server-once) — an afternoon, and never again
3. [A release](#a-release) — one command, several times a week
4. [Rebuilding from nothing](#rebuilding-from-nothing) — the day the server dies

Words that mean something specific here are defined the first time they appear,
in five words or so. There is a glossary at the end.

---

## On your laptop

You need Node 24 and pnpm. If `node --version` prints 24-something, you have
both; `corepack enable` brings pnpm along.

**1. Install what the app depends on.**

```sh
pnpm install --frozen-lockfile
```

_You should see_ a list of packages and "Done in …s". `--frozen-lockfile` means
"install exactly the versions written down", so you get what everyone else gets.

_If this went wrong:_ the usual cause is an older Node. `node --version` has to
start with `v24`.

**2. Put some data in.**

```sh
pnpm db:seed --owner you@example.com "Your Name" --sample
```

Use your own address and name. `--owner` makes that person the account that can
invite everybody else; `--sample` adds about forty invented records so the lists
have something in them.

_You should see_ "Your Name <you@example.com> is now the owner", a count of
sample items, and then "Sign in here" followed by a link. Keep that link for
step 3: it works once, within the hour. Run the same command again for a fresh
one. This is a database on your own machine; it never touches the server.

**3. Start it.**

```sh
pnpm dev
```

_You should see_ two addresses. Open the sign-in link from step 2 in a browser;
it signs you in and lands on the app at port 5173.

_If this went wrong:_ "port already in use" means a previous `pnpm dev` is still
running. Close that terminal window, or run `pkill -f vite`.

**4. Look at it on your phone.** This matters more than it sounds: these apps
are used standing up, on a phone, and a screen that is fine on a laptop is often
unusable there.

Find your Mac's address on the network — System Settings → Network → Wi-Fi →
Details, a number like `192.168.1.24` — and on your phone, connected to the same
Wi-Fi, open `http://192.168.1.24:5173`.

_If this went wrong:_ most often the phone is on a different network (a guest
Wi-Fi, or mobile data). Second most often, the Mac's firewall is on: System
Settings → Network → Firewall.

---

## Your server, once

A **VPS** is a rented computer in a data centre — yours alone, always on. One is
enough for these apps, and one is what this kit assumes.

This section is an afternoon's work and you do it once per app. Steps 1, 2 and 4
happen in someone else's website and cannot be automated; steps 3 and 5 are a
single command each.

### 1. Rent the server

Any of these three. They are all fine; pick on price and on which country you
want the data in, because that is the part that is hard to change later.

| Provider         | A sensible first size           | Where the backup switch lives                                                           |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| **Hetzner**      | CX22 — 2 cores, 4 GB, ~€4/month | Server → **Backups** tab → Enable. Costs 20% of the server price. Keeps 7 daily copies. |
| **DigitalOcean** | Basic 2 GB — ~$12/month         | Droplet → **Backups** → Setup Automated Backups. Weekly +20%, daily +30% of the price.  |
| **Hostinger**    | KVM 2 — ~€7/month               | hPanel → VPS → **Backups & Monitoring**. Weekly is included; daily is a paid add-on.    |

Choose **Ubuntu 24.04** as the operating system, and add your SSH key during
setup — every provider asks. An **SSH key** is a password you never type: a file
on your laptop that proves who you are.

**Turn the backup option on now, while you are in there.** It is the one thing
in this whole document that protects you from losing the machine itself, it
costs a few euros a month, and nobody has ever turned it on after they needed it.

_You should see_ an IP address, four numbers like `203.0.113.10`. Write it down.

### 2. Point your domain at it

Wherever you bought the domain, find DNS settings and add one record:

| Type | Name                                | Value              |
| ---- | ----------------------------------- | ------------------ |
| A    | the part before your domain, or `@` | the IP from step 1 |

_You should see_, after a few minutes, your IP when you run
`dig +short app.example.com` in a terminal.

_If this went wrong:_ DNS changes can take up to an hour, occasionally longer.
Go and do step 3 while you wait; nothing below needs the domain until step 5.

### 3. Set the server up

One command from the folder with this repository in it. Replace the two names
with yours.

```sh
ssh root@203.0.113.10 'bash -s' orders orders.example.com < deploy/server-setup.sh
```

_You should see_ about fifteen numbered lines, each saying what it did — a user
created, SSH locked down, a firewall, Docker installed, folders made, a settings
file written, a nightly backup scheduled — and a summary at the end telling you
what is left.

It is safe to run again. Every step checks first and says "already done" rather
than doing it twice.

_What it actually did, in one paragraph:_ made a user called `deploy` that you
(and only you, with your key) can log in as; turned off password logins entirely,
so the machines that scan the internet guessing passwords have nothing to guess;
closed every port except SSH and the web; installed Docker, which is what runs
the app; and scheduled a copy of the database every night at 03:15.

_If this went wrong:_ "Permission denied (publickey)" means the provider did not
put your key on the machine. Most providers let you paste it into the server's
settings page and rebuild; that is quicker than fixing it any other way.

### 4. Fill in the two e-mail lines

The app sends e-mail — sign-in links, invitations. It needs an account with
**Resend**, which is an e-mail provider with one API key and no SMTP settings to
get wrong. The free tier covers 3,000 e-mails a month, which is far more than
these apps send.

1. Sign up at resend.com.
2. Domains → Add domain → type your domain. It shows three DNS records; add them
   where you added the A record in step 2.
3. API Keys → Create API Key. Copy it; it starts with `re_` and is shown once.
4. Put it on the server:

```sh
ssh deploy@203.0.113.10 'nano /opt/orders/.env'
```

Fill in the two empty lines near the bottom:

```
RESEND_API_KEY=re_the_key_you_copied
EMAIL_FROM=Orders <hello@orders.example.com>
```

`Ctrl-O`, `Enter`, `Ctrl-X` to save and leave.

_If you skip this:_ nothing breaks. The app runs, and each e-mail it would have
sent is written to a file inside the app's container instead; its log names the
file. Sign-in links will not arrive in anyone's inbox until you fill these in.

### 5. Release

```sh
pnpm release $(git rev-parse HEAD)
```

Read the next section for what each line means. The first one takes longer than
the rest — it builds everything from scratch and waits for Caddy to fetch an
HTTPS certificate. It also has nothing to back up yet, and says so: the backup
and the rehearsal are skipped, and the database is created instead.

_You should see_, at the end, `Released … to orders.example.com` and an
invitation to go and look at it.

---

## A release

```sh
pnpm release <the 40-character commit id>
```

`git rev-parse HEAD` prints the id of what you have; the GitHub commit page has
it in the address bar. Add `--dry-run` to see the plan without doing anything.

It runs on your machine and drives the server over SSH. Every step is a gate:
**until the switch, a failure leaves the previous version running and the
database exactly as it was.** The script stops, tells you which gate refused and
why, and tidies up after itself whether it succeeded or not — Ctrl-C included.
Only one release runs at a time; a second one started meanwhile is refused.

What you will see, and what each line means:

| It prints                                                                           | What just happened                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checking that … is a commit on the main branch`                                    | Only merged work gets released. A commit sitting on a branch is refused.                                                                                                          |
| `no other release is running; holding the lock until this one ends`                 | The **lock**: one release at a time. It is let go the moment this one ends, however it ends.                                                                                      |
| `asking … what is running now`                                                      | Reads which version the server is serving.                                                                                                                                        |
| `replacing …, which … contains`                                                     | The **ancestor guard**: what is running has to be contained in what is going out. This is what stops a release from quietly undoing a newer one. `--allow-rollback` overrides it. |
| `nothing is deployed yet — this is the first release`                               | Printed instead, the first time.                                                                                                                                                  |
| `packed` … `digest matches on the server`                                           | The exact commit was packed, sent, and its fingerprint checked on the far side. A transfer that lost bytes stops here rather than looking like a code error twenty minutes later. |
| `building the image on the server from this exact commit`                           | The app is compiled **on the server**, from that archive. Nothing from your laptop goes into what runs.                                                                           |
| `database healthy`                                                                  | The database is up. It is started with the live version's settings, so nothing in the new release touches it before the backup exists.                                            |
| `backup verified`                                                                   | A copy of the database, taken before anything changes, and checked for being a real, fresh file rather than an empty or old one.                                                  |
| `the copy is restored  tables=…`                                                    | That backup was restored into a scratch database and it holds real tables. A backup that does not restore, or restores empty, stops the release here.                             |
| `the migration runs cleanly on real data`                                           | The **rehearsal**: the schema change was run against that copy. A migration that only ever ran on an empty database is not proved.                                                |
| `the first release has nothing to back up and no data to rehearse the migration on` | Printed instead of the three lines above, the first time only.                                                                                                                    |
| `schema is up to date`                                                              | The same change, now on the real database.                                                                                                                                        |
| `the new container is running`                                                      | **The switch.** The old app stops and the new one starts. Requests arriving in those few seconds wait rather than fail.                                                           |
| `… current now points at …`                                                         | The server now records this version as the live one. That happens at the switch, before the check below, so the record always names what is actually running.                     |
| `the app answers /health/ready`                                                     | The site is up.                                                                                                                                                                   |
| `serving …`                                                                         | And it is the version just sent, not the old one still answering.                                                                                                                 |
| `releases_removed=… dumps_removed=… disk=…`                                         | Old releases, dangling images and dumps over a fortnight old cleared out, and how much disk is left.                                                                              |
| `Released … in Xm Ys`                                                               | Done.                                                                                                                                                                             |
| `tidying up on …` / `removed …`                                                     | The temporary files — and the scratch database, if one was left — removed. Printed whenever a release got as far as sending anything, whether it succeeded or not.                |

### When a release refuses

**"… is not on main"** — merge the branch first, then release the merge commit.

**"another release is running (started …, releasing …)"** — someone (or some
agent) is releasing right now. Wait for it to finish and run the same command
again.

**"… does not contain the running release …"** — someone (or some agent) released
something newer while you were working. Releasing yours would undo theirs. Merge
main into your branch and release that.

**"the migration failed against a copy of the real data"** — the good outcome.
The schema change works on an empty database but not on yours. Nothing changed;
the live app is still serving. The output above the message is what the database
said.

**"pg_restore could not restore …" or "the rehearsal copy holds no tables"** —
the backup just taken could not be put back, so nothing could be proved with it.
Nothing changed. Stop and look at [backups](backups.md) before releasing again:
right now you do not have a backup you can restore.

**"the new release is serving but did not answer … within two minutes"** — the
new version started but is not answering. This is after the switch, so the site
may be down, and the server already records the new version as the live one.
Investigate before anything else, and do not release again over it until you
know what is wrong. Read the container's log:

```sh
ssh <your server> 'docker logs --tail 50 $(docker ps -q -f name=app)'
```

and either fix it and release the fix, or go back to the previous version:

```sh
pnpm release <the previous commit id> --allow-rollback
```

**"interrupted by SIGINT"** — you pressed Ctrl-C. Before the switch nothing
changed; the script removes what it put on the server and exits. After the
switch had begun, check which version the server records before you release
again.

### Going back on purpose

```sh
pnpm release <an older commit id> --allow-rollback
```

The ancestor guard exists so this cannot happen by accident; the flag is how you
say you mean it. Note what it does **not** do: a migration is not undone by
releasing older code. If the newer version changed the database's shape, going
back to code that does not know about that change may not work. Rolling back is
for "the new screen is broken", not for "the new migration was wrong".

---

## Rebuilding from nothing

The server is gone — deleted, or the provider lost it. You have this repository
and a backup.

**This path has not been rehearsed end to end.** Each piece of it runs (the
setup script, the restore, the release), but nobody has yet done all three in
order on a bare machine. Expect to fix a detail, and correct this file when you
do.

Two cases, and they are very different:

### You have the provider's snapshot

Restore it from the provider's control panel. That is the whole procedure: the
snapshot is the entire machine, database and all. Point the domain at the new IP
and you are running. This is why step 1 of "Your server, once" says to turn the
backup option on.

### You only have a database dump

You have a `.dump` file — from the server's `/var/backups/`, or one you copied
off. Each is named for the moment it was taken, like
`app-2026-09-21T031502Z.dump` (03:15:02 UTC on 21 September). Then:

1. **A new server**, Ubuntu 24.04, and the domain's A record pointed at it.
2. **Set it up**, the same command as before:
   ```sh
   ssh root@<new IP> 'bash -s' orders orders.example.com < deploy/server-setup.sh
   ```
   This writes a **new** `.env` with a new database password. That is correct —
   the database it will create is new too.
3. **Release**, so that the app, the database and the web server exist:
   ```sh
   pnpm release $(git rev-parse HEAD)
   ```
   It is the first release on this machine, so it has nothing to back up and
   says so. You now have a working, empty app.
4. **Put the data back.** Copy the dump up and restore it over the live database:
   ```sh
   scp app-2026-09-21T031502Z.dump deploy@<new IP>:/var/backups/orders/
   ssh -t deploy@<new IP> 'bash /opt/orders/current/deploy/restore.sh orders \
     /var/backups/orders/app-2026-09-21T031502Z.dump --into-live'
   ```
   It first checks the file is a dump it can read, and refuses if not. Then it
   asks you to type the app's name before it does anything. `-t` on the ssh line
   is what lets it ask. Before replacing anything it saves the empty app's data
   as `pre-restore-app-<time>.dump`, beside the others.
5. **Fill in the e-mail lines again** — step 4 of "Your server, once". They are
   not in the database dump.
6. **Check one record you recognise**, then tell whoever uses the app what they
   lost: everything between the dump's date and now.

_If this went wrong:_ `restore.sh` prints how many tables ended up in the
database. If that number is 0 or absurdly small, the dump is not what you think
it is. Try an older one — and see [backups](backups.md) for how to check a dump
before you need it.

---

## Glossary

- **VPS** — a rented computer in a data centre.
- **SSH** — a secure remote terminal to that computer.
- **SSH key** — a file proving who you are, instead of a password.
- **Domain / A record** — the name people type, pointed at an address.
- **Docker** — runs the app in a sealed box.
- **Container** — one running copy of that box.
- **Caddy** — the web server that handles HTTPS.
- **Migration** — a recorded change to the database's shape.
- **Commit id / sha** — the 40-character name of one saved change.
- **Dump** — one file holding the whole database.
- **Release** — putting one commit onto the server.
