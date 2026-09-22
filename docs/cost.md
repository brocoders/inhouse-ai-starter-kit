# What it costs to build and run

Prices last verified **22 September 2026**. When you read this later, check the
linked pages; the rules below outlive the numbers.

## The AI subscription

The agent that builds your app runs on a Claude subscription. Plans, per month:

| Plan        | Price                 | What you get                                                                   | Fits                                                        |
| ----------- | --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Pro         | USD 20                | Claude Code included; Opus, Sonnet, Haiku; Fable through credits               | Trying the kit, small changes                               |
| Max 5x      | USD 100               | Five times Pro's usage per five-hour window; Fable up to half the weekly limit | One app, a few sessions a week                              |
| **Max 20x** | USD 200               | Twenty times Pro's usage; the same Fable share                                 | **Building an app over several weeks — our recommendation** |
| Team        | USD 25 / 125 per seat | For several people directing the same project                                  | A company with two or more builders                         |

All paid plans also have a weekly ceiling across every model. A weeks-long build
on Max 20x normally stays inside it; parallel agent threads (Claude Code
Projects) use it several times faster, so keep to one orchestrator and at most
two workers unless you have room to spare.

If you also use OpenAI's Codex: Plus is USD 20, Pro USD 100 or 200 for five or
twenty times the limits; Codex is included in ChatGPT plans, not sold apart.

Sources: [claude.com/pricing](https://claude.com/pricing) ·
[ChatGPT pricing](https://learn.chatgpt.com/docs/pricing)

## Which model, and when

- **Opus 5** is the default for the session that plans, reviews and integrates.
- **Sonnet 5** does routine, well-fenced work when the orchestrator delegates.
- **Fable 5.1** is for the hard parts — a root cause nobody can find, a design
  that spans the whole app, a long autonomous run. Use it when you need it;
  the budget assumption of this kit is USD 100–500 a month, and a wrong turn
  costs more than a stronger model.
- **Turn effort up before switching models.** The same model can think harder
  (`/effort` or the setting in your client). Try that first.
- The agent tells you when it thinks a stronger model is needed; a session
  cannot switch itself.

API prices, for the AI helpers _inside_ your app (per million tokens, input /
output): Fable 5.1 USD 10 / 50, Opus 5 USD 5 / 25, Sonnet 5 USD 2 / 10, Haiku
4.5 USD 1 / 5. The `ai-feature` skill puts every such helper behind a monthly
budget the app enforces itself.

## The server and the rest

| Item                   | Typical cost           | Notes                                                                                   |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| One VPS (2 vCPU, 4 GB) | EUR 5–15 / month       | Hetzner, DigitalOcean, Hostinger; pick the region your data should live in              |
| Provider backups       | +20–30 % of the server | One checkbox; keep it on                                                                |
| Domain                 | EUR 10–15 / year       | Or a subdomain of one you own                                                           |
| E-mail sending         | Free tier              | Resend: 3,000 e-mails a month, 100 a day                                                |
| GitHub                 | Free                   | Private repository; 2,000 CI minutes a month, see `docs/agents.md` for keeping under it |
| A second small server  | EUR 5–10 / month       | Only when the app becomes business-critical: CI runner, backup target, debug copy       |

Roughly: **USD 200–250 a month while building, EUR 10–20 a month to run**
once the app is live and you change it rarely.
