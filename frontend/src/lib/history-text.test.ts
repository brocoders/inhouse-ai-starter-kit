// A history line is read by somebody who was not there; nothing in it may be
// a shrug like [object Object] or a 36-character id.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeValue } from './history-text.ts';

const words = { empty: '(empty)', record: 'another record', yes: 'yes', no: 'no' };
const say = (value: unknown) => describeValue(value, words);

describe('a value in a history sentence', () => {
  it('writes nothing, booleans and numbers plainly', () => {
    assert.equal(say(null), '(empty)');
    assert.equal(say(undefined), '(empty)');
    assert.equal(say(''), '(empty)');
    assert.equal(say(true), 'yes');
    assert.equal(say(false), 'no');
    assert.equal(say(12), '12');
    assert.equal(say('Open'), 'Open');
  });

  it('names an object by its name, title, label or email rather than [object Object]', () => {
    assert.equal(say({ id: 'x', name: 'Rita' }), 'Rita');
    assert.equal(say({ title: 'Renew the lease', dueOn: '2026-10-01' }), 'Renew the lease');
    assert.equal(say({ label: 'Late' }), 'Late');
    assert.equal(say({ email: 'rita@example.com' }), 'rita@example.com');
  });

  it('spells out a nameless object as short key: value pairs', () => {
    assert.equal(say({ code: 'E1', at: 3, ok: false }), 'code: E1, at: 3, ok: no');
    assert.equal(say({}), '(empty)');
    assert.equal(say({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }), 'a: 1, b: 2, c: 3, d: 4, e: 5');
  });

  it('writes a list as its members, and cuts a long one', () => {
    assert.equal(say(['a', 'b']), 'a, b');
    assert.equal(say([{ name: 'One' }, { name: 'Two' }]), 'One, Two');
    assert.equal(say([1, 2, 3, 4, 5, 6, 7]), '1, 2, 3, 4, 5, …');
  });

  it('calls an id what it is instead of printing it', () => {
    assert.equal(say('3f2b9c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'), 'another record');
    assert.equal(
      say({ assigneeId: '3f2b9c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f' }),
      'assigneeId: another record',
    );
  });
});
