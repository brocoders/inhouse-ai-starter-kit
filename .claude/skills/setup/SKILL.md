---
name: setup
description: The creator's first session — interview them, fill in the configuration, start the app and get it open on their phone. Ask for this by name, once, after cloning.
disable-model-invocation: true
---

# Your first hour

You are talking to someone who does not read code. Ask one thing at a time,
say what they should see after every step, and never show them a stack trace.

## 1. Interview

Use AskUserQuestion. You need:

- **What is the app called?** The name in the browser tab and in e-mails.
- **What is it for?** One or two sentences — what it keeps track of, and for
  whom. Write it into `docs/product.md`.
- **Who else will use it?** Just them, or a team? This decides the profile:
  `solo` means you review, merge and release your own work; `team` means you
  open a pull request and stop. Say which you recommend and why.
- **Where are they?** A city is enough — you turn it into a time zone and a
  locale. The whole app uses one of each.
- **Their name and e-mail address.** They become the owner account; the
  sign-in link is made for that address.
- **Do they have a server yet?** If not, that is fine; skip step 5.

## 2. Configuration

Fill in `inhouse.config.json` from the answers: `appName`, `profile`,
`timeZone`, `locale`, and `deploy` if they have a server. Show them the file
and read it back in plain words: "the app is called X, it shows times in
Y, and I will merge and release my own work."

## 3. Secrets

The app runs on its defaults with no `.env` at all, so nothing is needed today.
You cannot create or edit `.env`: a permission rule denies it and the sandbox
enforces that for every command. When a value only they can get is needed — an
e-mail provider key, for instance — hand it over as numbered steps: run
`cp .env.example .env` in the project folder, open `.env`, paste the value after
the named key, save. **Never type a key for them and never read `.env` back.**

## 4. Run it

1. `pnpm install`, then once `pnpm exec playwright install chromium` — the
   browser `pnpm shots` drives; screenshots fail without it.
2. `pnpm db:seed --owner their@email "Their Name" --sample`, with the address
   and name from the interview — creates the database, makes them the owner
   and adds the example rows. It prints a sign-in link; show it to them.
3. `pnpm dev` — they should see two lines saying the API and the app are
   running, and a link.
4. Open the sign-in link from step 2 (it works once, within the hour). They
   should see the example screen with rows of made-up data.
5. **On their phone**, on the same network, open the same address and add it to
   the home screen. This is the moment the thing becomes real; do not skip it.

## 5. Their server, if they have one

Setting up a server happens in their hosting provider's console, not here.
Hand it over as numbered steps — create the server, point the domain, add the
SSH alias — and say what to send back. Then the `release` skill takes over.

## 6. Finish

Say what exists now, what the example entity is, and that `/setup` can delete
it once they have something of their own. Then offer `plan-feature` for the
first real screen.
