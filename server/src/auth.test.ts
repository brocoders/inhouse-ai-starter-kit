// The sign-in rate limit is only a defence if it counts per person. Behind
// Caddy every connection comes from Caddy, so the budget has to follow the
// address in `X-Forwarded-For` — otherwise three wrong passwords from anybody
// would lock everybody out for ten seconds, and a patient attacker would get
// the same three guesses as the whole team put together.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { app } from './app.ts';
import { config } from './config.ts';
import { closeDb, makeUser, ready, reset } from './test/helpers.ts';

before(ready);
after(closeDb);
beforeEach(reset);

// Documentation addresses (RFC 5737): never anybody's real machine.
const FIRST = '192.0.2.10';
const SECOND = '198.51.100.20';

async function signIn(email: string, from: string): Promise<Response> {
  return app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: config.appUrl,
      'x-forwarded-for': from,
    },
    body: JSON.stringify({ email, password: 'not-the-password' }),
  });
}

describe('the sign-in rate limit', () => {
  it('gives each address its own budget', async () => {
    const person = await makeUser('member');
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await signIn(person.email, FIRST);
      assert.notEqual(response.status, 429, `attempt ${attempt} was refused too early`);
    }
    assert.equal((await signIn(person.email, FIRST)).status, 429, 'the fourth guess got through');

    // Somebody else, somewhere else, is not held responsible.
    const elsewhere = await signIn(person.email, SECOND);
    assert.notEqual(elsewhere.status, 429, 'a second address shared the first one’s budget');
  });

  it('does not let a forged chain of addresses pick its own budget', async () => {
    const person = await makeUser('member');
    // A header with several addresses did not come from Caddy, which always
    // sends exactly one. It resolves to no address, so it lands in the shared
    // budget rather than a fresh one per forged value.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await signIn(person.email, `203.0.113.${attempt}, ${FIRST}`);
    }
    assert.equal((await signIn(person.email, `203.0.113.99, ${SECOND}`)).status, 429);
  });
});
