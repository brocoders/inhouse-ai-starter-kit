// The settings file is read by someone who typed it, and the two mistakes a
// person makes — a line left blank, a value left for the config file — must
// not stop the server.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from './config.ts';

// A config file with values that are not the defaults, so a test that passes
// has proved the file was read and not merely that the defaults held.
const named = path.join(mkdtempSync(path.join(tmpdir(), 'inhouse-config-')), 'inhouse.config.json');
writeFileSync(
  named,
  JSON.stringify({ appName: 'Orders', timeZone: 'Europe/Berlin', locale: 'de-DE' }),
);
const missing = path.join(path.dirname(named), 'nowhere.json');

describe('settings', () => {
  it('treats a blank line as a line left out', () => {
    // server-setup.sh writes RESEND_API_KEY= and EMAIL_FROM= to fill in later;
    // the first release of the first real app stopped on exactly these.
    const config = loadConfig({ RESEND_API_KEY: '', EMAIL_FROM: '', APP_NAME: '' }, missing);
    assert.equal(config.resendApiKey, undefined);
    assert.equal(config.emailFrom, 'InHouse <no-reply@localhost>');
    assert.equal(config.appName, 'InHouse');
  });

  it('takes the name, zone and locale from inhouse.config.json unless .env says otherwise', () => {
    const fromFile = loadConfig({}, named);
    assert.equal(fromFile.appName, 'Orders');
    assert.equal(fromFile.timeZone, 'Europe/Berlin');
    assert.equal(fromFile.locale, 'de-DE');
    const fromEnv = loadConfig({ APP_NAME: 'Invoices', APP_TIME_ZONE: 'Europe/Kyiv' }, named);
    assert.equal(fromEnv.appName, 'Invoices');
    assert.equal(fromEnv.timeZone, 'Europe/Kyiv');
    assert.equal(fromEnv.locale, 'de-DE');
    assert.equal(loadConfig({}, missing).appName, 'InHouse');
  });

  it('never lets a test inherit the app the file names', () => {
    // A test run is a world of its own: the kit's own tests assume InHouse in
    // UTC, and so will an app's, until /setup has named it something else.
    const config = loadConfig({ NODE_TEST_CONTEXT: 'child' }, named);
    assert.equal(config.appName, 'InHouse');
    assert.equal(config.timeZone, 'UTC');
    assert.equal(config.isTest, true);
  });
});
