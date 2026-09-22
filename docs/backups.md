# Backups

Everything your app knows lives in one database on one machine. This page is
about the fact that it does, and what to do about it.

There are two copies by default, and they protect against different things.
Neither is optional, and together they take about ten minutes to set up and a few
euros a month.

| Copy                      | Protects against                                             | Does not protect against           |
| ------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| **The nightly dump**      | a bad migration, a deleted record, a release that went wrong | the machine itself being lost      |
| **The provider snapshot** | the machine being lost, deleted or corrupted                 | a mistake you made three hours ago |

---

## The nightly dump

Every night at 03:15 the server writes the whole database into one file in
`/var/backups/<app>/`, named for the date. Fourteen days are kept; the fifteenth
night removes the oldest. Each file is a few megabytes for a young app.

A **dump** is one file holding the entire database — every table, every row.

It is also taken once more, out of schedule, immediately before every release,
which is where it earns its keep most often: the newest dump is always from
before the last thing that could have broken anything.

**It is on the same disk as the database.** That is the honest limitation. It
answers "the migration ate a column" and "somebody deleted the wrong record"
perfectly, and answers "the server is gone" not at all.

To see what you have:

```sh
ssh deploy@<your server> 'bash /opt/orders/current/deploy/restore.sh orders --list'
```

_You should see_ a dated file for each of the last fourteen days. If the list is
short, or the newest is not from last night, something is wrong — check
`systemctl status orders-backup.timer` on the server.

---

## The provider snapshot

Your hosting provider will copy the whole machine — the operating system, the
database, the uploaded files, everything — on a schedule, for about 20% of what
the server costs. It is a checkbox.

| Provider         | Where                                           | What you get                            |
| ---------------- | ----------------------------------------------- | --------------------------------------- |
| **Hetzner**      | Server → **Backups** tab → Enable               | 7 daily copies, 20% of the server price |
| **DigitalOcean** | Droplet → **Backups** → Setup Automated Backups | weekly for 20%, daily for 30%           |
| **Hostinger**    | hPanel → VPS → **Backups & Monitoring**         | weekly included; daily is a paid add-on |

Restoring one is a button in the same panel, and it brings back the entire
machine. That is why "Rebuilding from nothing" in [running](running.md) is two
lines long if you have a snapshot and a page long if you do not.

**Turn it on when you rent the server**, before you have anything to lose. It is
the single highest-value few euros in this whole setup and nobody has ever
switched it on after they needed it.

---

## Prove a restore works, once

A backup nobody has restored is a hope, not a backup. Do this once, in the first
week, and then again whenever you feel uneasy. It takes about two minutes and
touches nothing that is running.

```sh
ssh deploy@<your server>
ls /var/backups/orders/                     # pick the newest file
bash /opt/orders/current/deploy/restore.sh orders \
  /var/backups/orders/app-2026-09-21.dump --into app_check
```

_You should see_ it create a separate database called `app_check`, restore into
it, and print how many tables ended up there — a number in the tens for a small
app. The live database is not touched; the app keeps serving throughout.

Then look inside and check something you recognise:

```sh
docker compose -f /opt/orders/current/compose.yaml --project-directory /opt/orders \
  --env-file /opt/orders/.env exec db psql -U app -d app_check
```

```sql
select count(*) from users;
\q
```

And throw the copy away:

```sql
drop database app_check;
```

_If this went wrong:_ a table count of 0, or pg_restore complaining about
something other than ownership, means that dump is not usable. Try an older one.
If none of them restore, stop and fix that before doing anything else — you are
currently running without a backup and do not know it.

`restore.sh` will also restore **over** the live database, with `--into-live`.
That one asks you to type the application's name first, and takes a dump of the
current data before it starts, so the undo exists. It is for rebuilding a server
or undoing a genuine disaster, not for looking at yesterday's numbers.

---

## Answering a question about live data

Three ways, in the order you should reach for them.

**1. Bring a copy down.** `pnpm db:copy` pulls the production data onto your own
machine, where you can do anything to it without consequence. This is the right
answer almost every time.

**2. The read-only login**, for a question only the live data can answer — "how
many of these are open _right now_". Set it up once:

```sh
ssh deploy@<your server> 'bash /opt/orders/current/deploy/db-readonly.sh orders'
```

It prints a password (once — put it in your password manager) and the two
commands for reaching the database through an SSH tunnel, which is a private pipe
through SSH to a port that is not on the internet.

That login can run `SELECT` and nothing else, and this is enforced by PostgreSQL
rather than by good intentions: every transaction it opens is read-only at the
server, any query is cancelled after 30 seconds, and it cannot create anything.
The 30 seconds matter more than they sound — a mistyped join across two large
tables is the ordinary way that a quick look at production becomes an outage.

**3. Never write to production directly.** Not with psql, not with a database
tool. Data changes through the app or through a migration, so that the change is
recorded, reviewed and repeatable. This is in `.claude/rules/deploy.md` as a
"never", and it is the rule that most often wants breaking at 11pm.

---

## When two copies stop being enough

Add a third when **the app becomes business-critical** — when a day without it
would cost real money or real trust. Not before: every extra copy is another
thing to maintain, another bill, and another thing that can silently stop working.

You will know. It is usually the week somebody outside your team starts depending
on it.

Two ways, in order of effort:

**Off-site object storage.** A nightly encrypted copy of the dump to S3, Backblaze
B2 or similar — a few cents a month at this data size. This is the one to reach
for: it survives losing the provider account, not just the machine. Ask the agent
for the "off-site backups" recipe; it is about twenty lines added to the backup
script plus a bucket and an access key.

**A second small server.** Slightly more work, and it pays for itself three ways:
somewhere to copy backups to, somewhere to run CI without slowing the app down,
and somewhere to bring a copy of production up when you need to debug against it.

One thing neither of them is: a replacement for testing the restore. A copy you
have never restored from is exactly as useful as no copy, and you find out which
on the worst possible day.

---

## What is not backed up

- **`/opt/<app>/.env`** — the database password, the session secret, the e-mail
  key. It is in the provider snapshot but not in the nightly dump. If you rebuild
  from a dump alone, `server-setup.sh` writes a fresh one and you fill in the two
  e-mail lines again. The one thing worth keeping a copy of elsewhere is the
  Resend API key, and that is replaceable in a minute from their dashboard.
- **Uploaded files** (the `appdata` volume) — in the provider snapshot, not in
  the dump. If attachments matter to you, that is a second reason the snapshot is
  not optional.
- **The code.** It is in Git, which is where it belongs. `pnpm release` rebuilds
  everything from a commit id.
