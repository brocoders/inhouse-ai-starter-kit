// The decision half of guard-commands.mjs, with no I/O, so a test can feed it
// every bypass anyone has found and the commands that must keep working.
//
//   judge(command) → the message to show the agent, or null to let it run
//
// It reads the command roughly the way a shell would: quotes are removed, so
// `git 'push'` is `git push`; `&&`, `;`, pipes, `$(…)` and backticks start a new
// command; and the text handed to `sh -c`, `eval`, `xargs`, `find -exec` and
// `node -e` is read again as a command of its own. It is still a pattern match,
// not a shell. The sandbox is the fence for what nobody thought of.

// Where deleting a whole tree is the normal thing to do: all three are rebuilt
// by a command, and none of them is ever the only copy of anything.
const DISPOSABLE = /^(?:\.\/)?(?:\.shots|dist|node_modules)(?:\/|$)/;

const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|::1|\[::1\]|0\.0\.0\.0|\/)/i;
const DB_PROGRAMS = new Set(['psql', 'pg_dump', 'pg_dumpall', 'pg_restore', 'dropdb']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const SCRIPT_RUNNERS = new Set(['node', 'deno', 'bun', 'tsx']);
const PYTHONS = new Set(['python', 'python3', 'perl', 'ruby']);
// Words that run the rest of the line as the real command. `xargs` is here
// because what it runs gets its arguments from a pipe the guard cannot see.
const WRAPPERS = new Set([
  'command',
  'builtin',
  'exec',
  'nohup',
  'time',
  'noglob',
  'nice',
  'timeout',
  'stdbuf',
  'env',
  'xargs',
]);
const WRAPPER_FLAGS_WITH_VALUE = {
  xargs: new Set(['-I', '-n', '-L', '-P', '-d', '-E', '-s', '-a']),
  nice: new Set(['-n']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  env: new Set(['-u', '-C', '-S']),
};
const MAX_DEPTH = 4;
const ENVIRONMENT = Symbol('environment');

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const base = (word) => word.split('/').pop();

const MESSAGES = {
  remove: (targets) =>
    `\`rm -rf ${targets.join(' ')}\` deletes a tree that nothing rebuilds.\n` +
    'Inside this project only .shots/, dist/ and node_modules/ are disposable — each of those is\n' +
    'recreated by a command. For anything else: move it aside, or ask the owner.',
  removeUnseen:
    'That deletes a tree whose name is only known when the command runs — a `$(…)`, a variable,\n' +
    'a pipe into `xargs` or a script — so nobody can check what goes. Name the directory literally;\n' +
    'only .shots/, dist/ and node_modules/ may be deleted without asking the owner.',
  database: (program, host) =>
    (host === ENVIRONMENT
      ? `That points \`${program}\` at a host taken from an environment variable, which this\n` +
        'guard cannot read and which usually holds the server.\n'
      : `That points \`${program}\` at ${host}, which is not this computer.\n`) +
    'Production data is read by taking a copy, not by reaching into it: run `pnpm db:copy`\n' +
    '(add --anonymize before screenshots) and work locally. For a live question that a copy\n' +
    'cannot answer, use the `readonly` role over the SSH tunnel — see the deploy rules.',
  sudo:
    '`sudo` changes the machine outside this project, and this session cannot see what else\n' +
    'depends on it. If something genuinely needs administrator rights, hand the owner the\n' +
    'exact command as a numbered step and let them run it.',
  composeDown:
    '`docker compose down -v` deletes the volumes, which is the database.\n' +
    'To restart the app use `docker compose restart` or `down` without -v. To start over\n' +
    'locally, delete data/dev/ — that one is a copy and `pnpm db:copy` rebuilds it.',
  forcePush:
    'A force push overwrites what is on the remote, including work that is not in this\n' +
    'checkout. Push normally; if the branch has diverged, rebase and say so. If history\n' +
    "genuinely has to be rewritten, that is the owner's decision, not this session's.",
  resetHard:
    '`git reset --hard` throws away every uncommitted change with no way back.\n' +
    'Use `git stash` to set the changes aside, or `git restore <file>` for the one file you\n' +
    'meant. `git reset` without --hard keeps the work.',
  pipeToShell:
    'Piping a download straight into a shell runs code nobody has read, with your rights.\n' +
    'Download it to a file, read it, then run it — or install the thing with pnpm, brew or\n' +
    'apt, which is what the stack doc expects.',
};

/**
 * Splits a command line into simple commands, each a list of words with the
 * quotes removed. Substitutions end the current command, and a word that still
 * carries one (it was inside double quotes) is returned in `nested` so the
 * caller reads its inside too.
 */
export function splitCommands(source) {
  const commands = [];
  const nested = [];
  let words = [];
  let word = null;
  let skipNext = false; // the word after a redirection is a file, not an argument
  const heredocs = []; // delimiters of `<<EOF` bodies that start on the next line
  const endWord = () => {
    if (word === null) return;
    if (skipNext) skipNext = false;
    else words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  // A here-document is data — a commit message, a file being written — unless
  // it is fed to a shell, so its body is kept aside on the command rather than
  // read as commands. judgeWords reads it when the command is `sh` or `bash`.
  const readHeredocs = (from) => {
    let at = from;
    const bodies = [];
    for (const { delimiter, strip } of heredocs.splice(0)) {
      const lines = [];
      while (at < source.length) {
        const end = source.indexOf('\n', at);
        const line = source.slice(at, end === -1 ? source.length : end);
        at = end === -1 ? source.length : end + 1;
        if ((strip ? line.replace(/^\t+/, '') : line) === delimiter) break;
        lines.push(line);
      }
      bodies.push(lines.join('\n'));
    }
    return { at, body: bodies.join('\n') };
  };
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (c === "'") {
      const close = source.indexOf("'", i + 1);
      const end = close === -1 ? source.length : close;
      word = (word ?? '') + source.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      let j = i + 1;
      let text = '';
      while (j < source.length && source[j] !== '"') {
        if (source[j] === '\\' && j + 1 < source.length) {
          text += source[j + 1];
          j += 2;
        } else text += source[j++];
      }
      if (/\$\(|`/.test(text)) nested.push(text);
      word = (word ?? '') + text;
      i = j + 1;
    } else if (c === '\\') {
      if (source[i + 1] !== '\n') word = (word ?? '') + (source[i + 1] ?? '');
      i += 2;
    } else if (c === '$' && source[i + 1] === '(') {
      endCommand();
      i += 2;
    } else if (c === '<' && source[i + 1] === '(') {
      endCommand();
      i += 2;
    } else if (c === '<' && source[i + 1] === '<' && source[i + 2] !== '<') {
      endWord();
      i += 2;
      const strip = source[i] === '-';
      if (strip) i++;
      while (source[i] === ' ' || source[i] === '\t') i++;
      const quoted = /^(['"])(.*?)\1/.exec(source.slice(i));
      const bare = /^\\?([A-Za-z0-9_]+)/.exec(source.slice(i));
      const match = quoted ?? bare;
      if (match) {
        heredocs.push({ delimiter: quoted ? quoted[2] : bare[1], strip });
        i += match[0].length;
      }
    } else if (c === '\n' && heredocs.length) {
      const { at, body } = readHeredocs(i + 1);
      endWord();
      words.heredoc = body;
      endCommand();
      i = at;
    } else if (c === '>' || c === '<') {
      endWord();
      i++;
      while (source[i] === '>' || source[i] === '&') i++;
      skipNext = true;
    } else if (
      c === '\n' ||
      c === ';' ||
      c === '&' ||
      c === '|' ||
      c === '(' ||
      c === ')' ||
      c === '`'
    ) {
      endCommand();
      i++;
    } else if (/\s/.test(c)) {
      endWord();
      i++;
    } else {
      word = (word ?? '') + c;
      i++;
    }
  }
  endCommand();
  return { commands, nested };
}

/** Drops leading assignments and wrappers; says whether `sudo` was among them. */
function unwrap(words) {
  let at = 0;
  let sudo = false;
  while (at < words.length) {
    const w = words[at];
    const name = base(w);
    if (ASSIGNMENT.test(w)) at++;
    else if (name === 'sudo' || name === 'doas') {
      sudo = true;
      at++;
    } else if (WRAPPERS.has(name)) {
      at++;
      const withValue = WRAPPER_FLAGS_WITH_VALUE[name] ?? new Set();
      while (at < words.length && words[at].startsWith('-')) {
        at += withValue.has(words[at]) ? 2 : 1;
      }
      // `timeout 30 cmd`: the duration is not the command.
      if (name === 'timeout' && /^\d/.test(words[at] ?? '')) at++;
    } else break;
  }
  return { rest: words.slice(at), sudo };
}

function checkRemove(args) {
  const flags = args.filter((w) => w.startsWith('-'));
  const recursive = flags.some((f) => /^-[^-]*r/i.test(f) || f === '--recursive');
  const forced = flags.some((f) => /^-[^-]*f/.test(f) || f === '--force');
  if (!recursive && !forced) return null;
  const targets = args.filter((w) => !w.startsWith('-'));
  if (!targets.length || targets.some((t) => /[$`]/.test(t))) return MESSAGES.removeUnseen;
  const risky = targets.filter((t) => !DISPOSABLE.test(t));
  return risky.length ? MESSAGES.remove(risky) : null;
}

function checkFind(args) {
  const roots = [];
  for (const w of args) {
    if (w.startsWith('-') || w === '(' || w === '!') break;
    roots.push(w);
  }
  if (args.includes('-delete') && !roots.every((r) => DISPOSABLE.test(r))) {
    return MESSAGES.remove(roots.length ? roots : ['.']);
  }
  return null;
}

/** `find … -exec cmd {} ;` — the part after -exec is a command of its own. */
function findExecBodies(args) {
  const bodies = [];
  args.forEach((w, i) => {
    if (w !== '-exec' && w !== '-execdir' && w !== '-ok') return;
    const end = args.findIndex((x, j) => j > i && (x === ';' || x === '+'));
    bodies.push(args.slice(i + 1, end === -1 ? undefined : end));
  });
  return bodies;
}

function hostsOf(args) {
  const hosts = [];
  args.forEach((w, i) => {
    if (w === '-h' || w === '--host') hosts.push(args[i + 1] ?? '');
    else if (w.startsWith('--host=')) hosts.push(w.slice('--host='.length));
    else if (/^-h[^-]/.test(w)) hosts.push(w.slice(2));
    const uri = /postgres(?:ql)?:\/\/(?:[^@\s/]*@)?(\[[^\]]+\]|[^:/\s?]+)/.exec(w);
    if (uri) hosts.push(uri[1]);
    const conninfo = /(?:^|\s)host(?:addr)?=([^\s]+)/.exec(w);
    if (conninfo) hosts.push(conninfo[1]);
  });
  return hosts;
}

// A host the guard cannot read — it comes from the environment at run time —
// is treated as the server, because that is what those variables usually hold.
const ENV_REFERENCE = /\$\{?(?:DATABASE_URL|PG[A-Z_]*)\b/;

function checkDatabase(program, args, lineHosts) {
  const explicit = hostsOf(args);
  const candidates = [...explicit, ...lineHosts];
  for (const host of candidates) {
    if (/[$`]/.test(host)) return MESSAGES.database(program, ENVIRONMENT);
    if (host && !LOCAL_HOST.test(host)) return MESSAGES.database(program, host);
  }
  const explicitLocal = explicit.some((h) => h && LOCAL_HOST.test(h));
  if (!explicitLocal && args.some((w) => ENV_REFERENCE.test(w))) {
    return MESSAGES.database(program, ENVIRONMENT);
  }
  return null;
}

// Global options git accepts before the subcommand.
const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

function checkGit(args) {
  let at = 0;
  while (at < args.length && args[at].startsWith('-')) {
    at += GIT_OPTIONS_WITH_VALUE.has(args[at]) ? 2 : 1;
  }
  const sub = args[at];
  const rest = args.slice(at + 1);
  if (sub === 'push') {
    const forced = rest.some(
      (w) =>
        w === '--force' ||
        w === '--mirror' ||
        /^-[a-z]*f[a-z]*$/i.test(w) ||
        (!w.startsWith('-') && w.startsWith('+')),
    );
    if (forced) return MESSAGES.forcePush;
  }
  if (sub === 'reset' && rest.includes('--hard')) return MESSAGES.resetHard;
  return null;
}

function checkDocker(program, args) {
  const compose = program === 'docker-compose' || args[0] === 'compose';
  if (!compose || !args.includes('down')) return null;
  return args.some((w) => w === '--volumes' || /^-[a-z]*v[a-z]*$/.test(w))
    ? MESSAGES.composeDown
    : null;
}

/** JavaScript handed to `node -e`: a recursive delete, or a shell command in a string. */
function checkScript(code, depth) {
  const deletes = /\b(?:rmSync|rmdirSync|rm|rmdir)\s*\(/.test(code);
  if (deletes && /rmdirSync|recursive\s*:\s*true|force\s*:\s*true/.test(code)) {
    const literals = [
      ...code.matchAll(/\b(?:rmSync|rmdirSync|rm|rmdir)\s*\(\s*(['"`])([^'"`]*)\1/g),
    ];
    if (!literals.length) return MESSAGES.removeUnseen;
    const risky = literals.map((m) => m[2]).filter((t) => !DISPOSABLE.test(t));
    if (risky.length) return MESSAGES.remove(risky);
  }
  if (/\brmtree\s*\(/.test(code)) {
    const literal = /\brmtree\s*\(\s*(['"])([^'"]*)\1/.exec(code);
    if (!literal) return MESSAGES.removeUnseen;
    if (!DISPOSABLE.test(literal[2])) return MESSAGES.remove([literal[2]]);
  }
  // execSync('rm -rf docs') and friends: a string in the script may be a
  // command line of its own.
  for (const [, , literal] of code.matchAll(/(['"`])((?:(?!\1).)*)\1/g)) {
    const problem = judge(literal, depth + 1);
    if (problem) return problem;
  }
  return judge(code, depth + 1);
}

function judgeWords(words, depth, lineHosts) {
  const heredoc = words.heredoc;
  const { rest, sudo } = unwrap(words);
  if (sudo) return MESSAGES.sudo;
  if (!rest.length) return null;
  const program = base(rest[0]);
  const args = rest.slice(1);

  if (SHELLS.has(program)) {
    const flag = args.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w));
    if (flag !== -1 && args[flag + 1] !== undefined) return judge(args[flag + 1], depth + 1);
    return heredoc ? judge(heredoc, depth + 1) : null;
  }
  if (program === 'eval') return judge(args.join(' '), depth + 1);
  if (SCRIPT_RUNNERS.has(program) || PYTHONS.has(program)) {
    const evalFlag = PYTHONS.has(program) ? /^-[ce]$/ : /^(?:-e|-p|-pe|--eval|--print)$/;
    const flag = args.findIndex((w) => evalFlag.test(w));
    const inline = args.find((w) => /^--(?:eval|print)=/.test(w));
    const code = inline
      ? inline.replace(/^--(?:eval|print)=/, '')
      : flag !== -1
        ? args[flag + 1]
        : undefined;
    return code === undefined ? null : checkScript(code, depth);
  }
  if (program === 'rm') return checkRemove(args);
  // `ssh box rm -rf …`, `docker compose exec app rm -rf …`: an rm further along
  // is still an rm. Not after git, where `git rm` only touches the index.
  const rmAt = program === 'git' ? -1 : rest.findIndex((w, i) => i > 0 && base(w) === 'rm');
  if (rmAt !== -1) {
    const problem = checkRemove(rest.slice(rmAt + 1));
    if (problem) return problem;
  }
  if (program === 'find') {
    for (const body of findExecBodies(args)) {
      const problem = judgeWords(body, depth + 1, lineHosts);
      if (problem) return problem;
    }
    return checkFind(args);
  }
  if (program === 'git') return checkGit(args);
  if (program === 'docker' || program === 'docker-compose') {
    const problem = checkDocker(program, args);
    if (problem) return problem;
  }
  // A database client anywhere in the words, so `docker compose exec db psql -h …`
  // and `ssh box pg_dump …` are read as well as a bare `psql`.
  const dbAt = rest.findIndex((w) => DB_PROGRAMS.has(base(w)));
  if (dbAt !== -1) return checkDatabase(base(rest[dbAt]), rest.slice(dbAt + 1), lineHosts);
  return null;
}

/** The message to block `command` with, or null when it may run. */
export function judge(command, depth = 0) {
  if (typeof command !== 'string' || !command.trim() || depth > MAX_DEPTH) return null;

  // A pipe into a shell is one command by design, so it is matched whole.
  if (/\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/.test(command)) {
    return MESSAGES.pipeToShell;
  }
  if (/\b(?:ba|z|da)?sh\b[^\n]*(?:<\(|\$\()\s*(?:curl|wget)\b/.test(command)) {
    return MESSAGES.pipeToShell;
  }

  const { commands, nested } = splitCommands(command);
  // `PGHOST=prod psql` and `export PGHOST=prod; psql` both aim every database
  // command on the line at that host.
  const lineHosts = commands
    .flat()
    .map((w) => /^(?:PGHOST|PGHOSTADDR)=(.*)$/.exec(w)?.[1])
    .filter((h) => h !== undefined);

  for (const words of commands) {
    const problem = judgeWords(words, depth, lineHosts);
    if (problem) return problem;
  }
  for (const inner of nested) {
    const problem = judge(inner, depth + 1);
    if (problem) return problem;
  }
  return null;
}
