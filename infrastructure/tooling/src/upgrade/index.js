import readline from 'readline/promises';
import {
  execCommandOutput,
  execCommandVisible,
  formatCommand,
  gitStatus,
  modifyRepoJSON,
  readRepoFile,
  readRepoJSON,
  shellQuote,
  writeRepoFile,
  REPO_ROOT,
} from '../utils/index.js';

const printShellEnv = env => {
  for (const [key, value] of Object.entries(env)) {
    console.log(`${key}=${shellQuote(value)}`);
  }
};

const run = async (command, args, { dryRun = false, ignoreReturn = false } = {}) => {
  const argv = [command, ...args];
  console.log(`+ ${formatCommand(argv)}`);
  if (dryRun) {
    return;
  }

  await execCommandVisible({
    dir: REPO_ROOT,
    command: argv,
    ignoreReturn,
  });
};

const commandOutput = async (command, args) => await execCommandOutput({
  dir: REPO_ROOT,
  command: [command, ...args],
});

const fetchJSON = async url => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return await res.json();
};

const normalizeVersion = ({ version, label, prefix = '', stripPrefix = /^v/ }) => {
  version = version.replace(stripPrefix, '');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error(`invalid ${label} version: ${version}; expected major.minor.patch`);
  }
  return `${prefix}${version}`;
};

export const normalizeNodeVersion = version => normalizeVersion({ version, label: 'Node.js' });

export const normalizeGoVersion = version => normalizeVersion({
  version,
  label: 'Go',
  prefix: 'go',
  stripPrefix: /^go/,
});

export const normalizeToolVersion = version => {
  version = version.replace(/^v/, '');
  if (!/^[0-9]+(\.[0-9]+){1,2}([-+][A-Za-z0-9._-]+)?$/.test(version)) {
    throw new Error(`invalid version: ${version}`);
  }
  return version;
};

const runtimeChangelogHeader = 'audience: general\nlevel: patch\n---\n';

export const nodeChangelogBody = target => `${runtimeChangelogHeader}Upgrades to Node.js v${target}.\n`;

export const goChangelogBody = ({ targetGo, targetGolangciLint, golangciLintChanged }) => {
  const golangciLintSuffix = golangciLintChanged ?
    ` and golangci-lint v${targetGolangciLint}` :
    '';

  return `${runtimeChangelogHeader}Upgrades to ${targetGo}${golangciLintSuffix}.\n\nRelease notes [here](https://go.dev/doc/devel/release#${targetGo}).\n`;
};

export const golangciLintChangelogBody = targetGolangciLint =>
  `${runtimeChangelogHeader}Upgrades to golangci-lint v${targetGolangciLint}.\n`;

const currentNodeVersion = async () => {
  return (await readRepoJSON('package.json')).engines.node;
};

const currentGoVersion = async () => {
  return (await readRepoFile('.go-version')).trim();
};

const currentGolangciLintVersion = async () => {
  return (await readRepoFile('.golangci-lint-version')).trim();
};

const latestNodeLtsRelease = async () => {
  const releases = await fetchJSON('https://nodejs.org/dist/index.json');
  const release = releases.find(r => r.lts);
  if (!release) {
    throw new Error('could not resolve latest Node.js LTS release');
  }
  return normalizeNodeVersion(release.version);
};

export const resolveNodeVersion = async spec => {
  if (spec === 'latest') {
    return await latestNodeLtsRelease();
  }
  return normalizeNodeVersion(spec);
};

export const resolveGoVersion = async spec => {
  if (spec === 'latest') {
    const releases = await fetchJSON('https://go.dev/dl/?mode=json');
    if (!releases[0]?.version) {
      throw new Error('could not resolve latest Go version');
    }
    return normalizeGoVersion(releases[0].version);
  }
  return normalizeGoVersion(spec);
};

export const resolveGolangciLintVersion = async ({ spec, currentGo, targetGo }) => {
  switch (spec) {
    case 'skip':
      return 'skip';
    case 'auto':
      if (targetGo === currentGo) {
        return await currentGolangciLintVersion();
      }
      return await resolveGolangciLintVersion({ spec: 'latest', currentGo, targetGo });
    case 'latest': {
      const res = await fetch('https://github.com/golangci/golangci-lint/releases/latest', {
        method: 'HEAD',
        redirect: 'follow',
      });
      return normalizeToolVersion(new URL(res.url).pathname.split('/').at(-1));
    }
    default:
      return normalizeToolVersion(spec);
  }
};

const confirmDirtyTree = async ({ dryRun, yes }) => {
  if (dryRun) {
    return;
  }

  const status = await gitStatus({ dir: REPO_ROOT });
  if (status.length === 0 || yes) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error('working tree has uncommitted changes; pass --yes to continue');
  }

  console.error(status.join('\n'));
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const reply = await rl.question('Working tree has uncommitted changes. Continue? [y/N] ');
  rl.close();

  if (!['y', 'yes'].includes(reply.trim().toLowerCase())) {
    throw new Error('aborted');
  }
};

const writeTextFile = async ({ file, value, dryRun }) => {
  console.log(`+ write ${file}`);
  if (!dryRun) {
    await writeRepoFile(file, `${value}\n`);
  }
};

const writeNodeVersion = async ({ version, dryRun }) => {
  console.log('+ update package.json engines.node');
  if (dryRun) {
    return;
  }

  await modifyRepoJSON('package.json', contents => {
    if (!contents.engines || typeof contents.engines.node !== 'string') {
      throw new Error('Could not find engines.node in package.json');
    }
    contents.engines.node = version;
  });
};

const writeChangelog = async ({ file, body, dryRun }) => {
  try {
    await readRepoFile(file);
    console.log(`${file} already exists`);
    return;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  console.log(`+ write ${file}`);
  if (!dryRun) {
    await writeRepoFile(file, body);
  }
};

const ensureGoVersion = async expected => {
  const output = await commandOutput('go', ['version']);
  const match = output.match(/^go version (go[0-9]+\.[0-9]+\.[0-9]+)\b/m);
  if (!match) {
    throw new Error(`Could not parse 'go version' output: ${output.trim()}`);
  }
  const actual = match[1];
  if (actual !== expected) {
    const goPath = (await commandOutput('which', ['go'])).trim();
    throw new Error(`Found ${actual} at ${goPath}. Expected ${expected} after 'gvm use ${expected}'. The gvm install for ${expected} may be stale; run 'gvm uninstall ${expected}' and rerun this script.`);
  }
};

const printCompletion = label => {
  console.log(`\n${label} upgrade preparation complete.\n`);
  console.log('Next steps:');
  console.log('  * Review the generated diff.');
  console.log('  * Review the generated changelog snippet.');
  console.log('  * Build and push new images if this upgrade is ready to ship.');
};

const initialGenerate = async ({ dryRun, label }) => {
  try {
    await run('yarn', ['generate'], { dryRun });
  } catch (err) {
    if (err.exitCode === undefined) {
      throw err;
    }
    console.log(`Initial yarn generate failed after ${label} update: ${err.message}`);
    console.log('Continuing before the final generate.');
  }
};

export const prepareNodeShell = async options => {
  const current = await currentNodeVersion();
  const target = await resolveNodeVersion(options.node || 'latest');
  const changed = target !== current;

  console.error('Resolved Node.js upgrade target:');
  console.error(`  Node.js: ${current} -> ${target}`);

  if (!changed) {
    console.error('No Node.js version change to apply.');
  } else {
    await confirmDirtyTree({ dryRun: options.dryRun, yes: options.yes });
  }

  printShellEnv({
    UPGRADE_NODE_TARGET: target,
    UPGRADE_NODE_CHANGED: changed ? '1' : '0',
    UPGRADE_DRY_RUN: options.dryRun ? '1' : '0',
  });
};

export const applyNode = async options => {
  const target = normalizeNodeVersion(options.targetNode);
  const dryRun = Boolean(options.dryRun);

  await writeNodeVersion({ version: target, dryRun });
  await initialGenerate({ dryRun, label: 'Node.js' });
  await run('yarn', ['install'], { dryRun });
  await run('yarn', ['generate'], { dryRun });
  await writeChangelog({
    file: `changelog/node-${target}.md`,
    body: nodeChangelogBody(target),
    dryRun,
  });

  printCompletion('Node.js');
};

export const prepareGoShell = async options => {
  const currentGo = await currentGoVersion();
  const currentGolangciLint = await currentGolangciLintVersion();
  const targetGo = await resolveGoVersion(options.go || 'latest');
  const targetGolangciLint = await resolveGolangciLintVersion({
    spec: options.golangciLint || 'auto',
    currentGo,
    targetGo,
  });
  const goChanged = targetGo !== currentGo;
  const golangciLintChanged = targetGolangciLint !== 'skip' && targetGolangciLint !== currentGolangciLint;
  const changed = goChanged || golangciLintChanged;

  console.error('Resolved Go upgrade targets:');
  console.error(`  Go:            ${currentGo} -> ${targetGo}`);
  console.error(`  golangci-lint: ${currentGolangciLint} -> ${targetGolangciLint}`);

  if (!changed) {
    console.error('No Go or golangci-lint version changes to apply.');
  } else {
    await confirmDirtyTree({ dryRun: options.dryRun, yes: options.yes });
  }

  printShellEnv({
    UPGRADE_GO_TARGET: targetGo,
    UPGRADE_GO_CHANGED: goChanged ? '1' : '0',
    UPGRADE_GOLANGCI_LINT_TARGET: targetGolangciLint,
    UPGRADE_GOLANGCI_LINT_CHANGED: golangciLintChanged ? '1' : '0',
    UPGRADE_DRY_RUN: options.dryRun ? '1' : '0',
  });
};

export const applyGo = async options => {
  const targetGo = normalizeGoVersion(options.targetGo);
  const targetGolangciLint = options.targetGolangciLint === 'skip' ?
    'skip' :
    normalizeToolVersion(options.targetGolangciLint);
  const dryRun = Boolean(options.dryRun);
  const goChanged = Boolean(options.goChanged);
  const golangciLintChanged = Boolean(options.golangciLintChanged);

  if (goChanged && !dryRun) {
    await ensureGoVersion(targetGo);
  }

  if (goChanged) {
    await run('go', ['mod', 'download'], { dryRun });
    await writeTextFile({ file: '.go-version', value: targetGo, dryRun });
  }

  if (golangciLintChanged) {
    await writeTextFile({ file: '.golangci-lint-version', value: targetGolangciLint, dryRun });
  }

  if (goChanged) {
    await initialGenerate({ dryRun, label: 'Go' });
    await run('go', ['mod', 'tidy'], { dryRun });
    await run('go', ['fmt', './...'], { dryRun });
    await run('go', ['tool', 'goimports', '-w', '.'], { dryRun });
    await run('yarn', ['generate'], { dryRun });
  }

  if (goChanged) {
    await writeChangelog({
      file: `changelog/go-${targetGo.replace(/^go/, '')}.md`,
      body: goChangelogBody({ targetGo, targetGolangciLint, golangciLintChanged }),
      dryRun,
    });
  } else if (golangciLintChanged) {
    await writeChangelog({
      file: `changelog/golangci-lint-${targetGolangciLint}.md`,
      body: golangciLintChangelogBody(targetGolangciLint),
      dryRun,
    });
  }

  printCompletion(goChanged ? 'Go' : 'golangci-lint');
};
