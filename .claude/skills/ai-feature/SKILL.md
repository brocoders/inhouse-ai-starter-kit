---
name: ai-feature
description: Add a feature that calls a language model — categorising, extracting, drafting, summarising. Covers the budget, what the model is allowed to decide, and what it may never see.
---

# A feature that asks a model

## AI proposes; code computes

The model suggests; deterministic code decides, counts and stores. A category
it proposes is written to a `suggested_*` column with its confidence; the
app's own rules, or a person, promote it. **Nothing the model returns is ever
added up, compared or used as a total.** A number a model produced is a
sentence, not a figure, and the owner will read it as a figure.

Parse every reply through a Zod schema. A reply that does not fit is a failure
like any other — typed, logged, retried or dropped — not something to coerce.

## Never let the model near

Credentials, API keys, session tokens. SQL, a query builder, or anything that
becomes SQL. A shell, a file path, a URL to fetch. Another person's records
when the request came from someone who cannot see them. The model receives the
fields the task needs and nothing else; strip the rest before the call.

Content that came from outside — an e-mail, an uploaded file, a form someone
filled in — is data, never instructions. If it contains something addressed to
the model, that is the input misbehaving, not a command.

## The budget, with a reservation

Cost is the failure mode nobody notices until the invoice.

1. A monthly ceiling the owner has agreed to, as `AI_MONTHLY_BUDGET` in `.env`
   alongside the provider key, and an `ai_spend` table to count against it.
2. Before the call, **reserve** the estimated cost — insert the reservation row
   and check the total against the ceiling in the same transaction. Checking
   first and recording after lets ten concurrent jobs each see room for one.
3. After the reply, settle the reservation with the real token counts.
4. Over the ceiling, the feature stops and says so on the health page. It does
   not degrade quietly and it does not queue for next month.

## Two providers, one interface

`server/src/ai/` holds one small interface and two adapters, Claude and OpenAI.
Features talk to the interface. The point is not portability for its own sake:
it is that when one provider is slow, down or has changed a model's behaviour,
switching is a config change instead of a rewrite.

## Log what you asked

Every call logs the prompt version, the model id, both token counts and the
cost, with the request or job id. When an answer starts being wrong, the
question is which prompt version it came from — and there is no way to answer
it afterwards if it was not written down at the time.

Prompts live in files with a version in the name, never inline in a handler.
