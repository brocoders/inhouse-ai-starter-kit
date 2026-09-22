// Reads inhouse.config.json for the scripts and hooks that need it.
// Dependency-free, and deliberately strict: a typo here surfaces as a release
// pointed at the wrong server or dates formatted in the wrong zone, which is
// expensive to notice later. Every message says what to fix and where.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const CONFIG_PATH = path.join(ROOT, 'inhouse.config.json');

const PROFILES = ['solo', 'team'];

class ConfigError extends Error {}

function fail(message) {
  throw new ConfigError(`inhouse.config.json: ${message}`);
}

function requireString(value, key, hint) {
  if (typeof value !== 'string' || value.trim() === '') fail(`"${key}" is missing. ${hint}`);
  return value.trim();
}

// A whole IANA database is not worth shipping; asking Intl whether it knows the
// zone is the same question the app itself will ask at run time.
function knownTimeZone(zone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function knownLocale(tag) {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

export function readConfig({ file = CONFIG_PATH } = {}) {
  if (!existsSync(file)) {
    fail('not found. Copy the one in the kit, or run the /setup skill to fill it in.');
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(
      `is not valid JSON (${error.message}). A missing comma or a trailing one is the usual cause.`,
    );
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    fail('should hold one object.');

  const appName = requireString(raw.appName, 'appName', 'It is the name people see in the tab.');
  const profile = requireString(raw.profile, 'profile', `Use one of: ${PROFILES.join(', ')}.`);
  if (!PROFILES.includes(profile)) {
    fail(`"profile" is "${profile}"; it has to be ${PROFILES.join(' or ')}.`);
  }
  const timeZone = requireString(raw.timeZone, 'timeZone', 'Use an IANA name such as Europe/Kyiv.');
  if (!knownTimeZone(timeZone)) {
    fail(
      `"timeZone" is "${timeZone}", which this computer does not know. Use an IANA name such as Europe/Kyiv.`,
    );
  }
  const locale = requireString(raw.locale, 'locale', 'Use a tag such as en-GB.');
  if (!knownLocale(locale)) {
    fail(
      `"locale" is "${locale}", which is not a language tag. Use something like en-GB or uk-UA.`,
    );
  }

  const deploy = raw.deploy;
  if (
    deploy === undefined ||
    deploy === null ||
    typeof deploy !== 'object' ||
    Array.isArray(deploy)
  ) {
    fail(
      '"deploy" is missing. It needs host, dir and domain — see the notes at the top of the file.',
    );
  }
  const host = requireString(
    deploy.host,
    'deploy.host',
    'It is the SSH alias from ~/.ssh/config, not an address.',
  );
  // An address in this field would be committed, and the secret checker would
  // then block the commit; saying so here is friendlier than that failure.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    fail(
      `"deploy.host" is an IP address. This file is committed, so put the address in ~/.ssh/config under a name and use that name here.`,
    );
  }
  const dir = requireString(
    deploy.dir,
    'deploy.dir',
    'It is the folder on the server holding compose.yaml.',
  );
  if (!dir.startsWith('/'))
    fail(`"deploy.dir" is "${dir}"; it has to be an absolute path such as /srv/inhouse.`);
  const domain = requireString(
    deploy.domain,
    'deploy.domain',
    'It is the domain the app answers on.',
  );

  return { appName, profile, timeZone, locale, deploy: { host, dir, domain } };
}

// Callers that only want to report the problem and stop, rather than print a
// stack trace at a person who does not read code.
export function readConfigOrExit(options) {
  try {
    return readConfig(options);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}

export { ConfigError, PROFILES };
