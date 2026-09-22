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
- **Do they have a server yet?** If not, that is fine; skip step 5.

## 2. Configuration

Fill in `inhouse.config.json` from the answers: `appName`, `profile`,
`timeZone`, `locale`, and `deploy` if they have a server. Show them the file
and read it back in plain words: "the app is called X, it shows times in
Y, and I will merge and release my own work."

## 3. Secrets

Copy `.env.example` to `.env` yourself. Then tell them which values only they
can get, as numbered steps with what to click — an e-mail provider key, for
instance. Leave the rest at the defaults. **Never type a key for them and never
read `.env` back.**

## 4. Run it

1. `pnpm install`
2. `pnpm db:seed --owner` — creates the database and makes them the owner.
   They should see their own name and e-mail in the output.
3. `pnpm dev` — they should see two lines saying the API and the app are
   running, and a link.
4. Open the link. They should see the example screen with a few rows of
   made-up data.
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
