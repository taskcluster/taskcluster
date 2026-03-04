import yaml from 'js-yaml';
import semver from 'semver';
import glob from 'glob';
import chalk from 'chalk';
import appRootDir from 'app-root-dir';

import {
  REPO_ROOT,
  readRepoFile,
  readRepoJSON,
  writeRepoFile,
  gitAdd,
  gitLog,
  gitCurrentBranch,
} from '../utils/index.js';

import taskcluster from '@taskcluster/client';
import path from 'path';
import openEditor from 'open-editor';
import { Octokit } from '@octokit/rest';

const ALLOWED_LEVELS = {
  'major': 1,
  'minor': 2,
  'patch': 3,
  'silent': 4,
};

const ALLOWED_AUDIENCES = [
  'general',
  'deployers',
  'worker-deployers',
  'admins',
  'users',
  'developers',
];

/**
 * compare levels, with major being first
 */
const levelcmp = (a, b) => {
  return ALLOWED_LEVELS[a] - ALLOWED_LEVELS[b];
};

/**
 * compare strings
 */
const strcmp = (a, b) => {
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
};

/**
 * Representation of the as-yet-unreleased changelog snippets
 *
 * options: {
 *   skipUpdates: if true, don't load dependabot updates
 * }
 */
export class ChangeLog {
  constructor(options = {}) {
    this.loaded = false;
    this.snippets = [];
    this.updates = [];
    this.options = options;
  }

  async load() {
    await this.loadSnippets();
    if (!this.options.skipUpdates) {
      await this.loadUpdates();
    }
  }

  async loadSnippets() {
    const snippetFiles = glob.sync('changelog/*.md', { cwd: appRootDir.get() })
      .filter(filename => filename !== 'changelog/README.md');

    this.snippets = await Promise.all(snippetFiles.map(async filename => {
      // include a trailing newline in case the file lacks one
      const snippetContent = (await readRepoFile(filename)).trimEnd() + '\n';
      const [headerYaml, body] = snippetContent.split('\n---\n', 2);

      let { level, audience, reference, ...extra } = yaml.load(headerYaml);
      if (Object.keys(extra).length !== 0) {
        throw new Error(`Snippet ${filename}: extra properties in header`);
      }

      if (!level || !ALLOWED_LEVELS[level]) {
        throw new Error(`Snippet ${filename}: invalid level. Must be in ${JSON.stringify(ALLOWED_LEVELS)}`);
      }

      if (level !== 'silent' && (!body || body.trim().length === 0)) {
        throw new Error(`Snippet ${filename} is malformed or has no body`);
      }

      if (!audience || !ALLOWED_AUDIENCES.includes(audience)) {
        throw new Error(`Snippet ${filename}: invalid audience '${audience}'. Must be in ${JSON.stringify(ALLOWED_AUDIENCES)}`);
      }

      if (reference) {
        reference = reference.trim();
        if (reference.match(/^issue \d+$/)) {
          reference = `[#${reference.slice(6)}](https://github.com/taskcluster` +
          `/taskcluster/issues/${reference.slice(6)})`;
        } else if (reference.match(/^bug \d+$/)) {
          reference = `[${reference}](http://bugzil.la/${reference.slice(4)})`;
        } else {
          throw new Error(`Snippet ${filename}: invalid reference '${reference}'`);
        }
      }

      return { filename, audience, level, reference, body };
    }));

    const cmp = (a, b) => {
      return levelcmp(a.level, b.level) || strcmp(a.body, b.body);
    };

    this.snippets.sort(cmp);
  }

  async loadUpdates() {
    const lastVersion = await this.lastVersion();
    this.updates = await gitLog({
      dir: REPO_ROOT,
      args: [`v${lastVersion}..HEAD`, '--author=dependabot', "--pretty=%s (%h)"],
    });
  }

  /**
   * Get the highest snippet level, determining the overall level
   * of this release.
   */
  level() {
    let minor = false;
    for (let { level } of this.snippets) {
      if (level === 'major') {
        return 'major';
      }
      if (level === 'minor') {
        minor = true;
      }
    }
    return minor ? 'minor' : 'patch';
  }

  async lastVersion() {
    const pkgJson = await readRepoJSON('package.json');
    return pkgJson.version;
  }

  /**
   * Get the next version number, given the current level.
   */
  async nextVersion() {
    return semver.inc(await this.lastVersion(), this.level());
  }

  /**
   * Get the formatted list of snippets as a string
   */
  async format() {
    if (this.snippets.length === 0 && this.updates.length === 0) {
      return 'No changes';
    }

    const levelLabels = {
      'major': '[MAJOR]',
      'minor': '[minor]',
      'patch': '[patch]',
    };

    const silent = this.snippets.filter(sn => sn.level === 'silent' && sn.reference);
    const silentCount = silent.length;
    const silentLinks = silent.map(sn => sn.reference).join(', ');
    const silentSuffix = silentCount === 0 ?
      '' :
      `\n\n### OTHER\n\n▶ Additional change${silentCount === 1 ? '' : 's'} not described here: ${silentLinks}.`;

    // These changelog snippets are already sorted in level-order so when we insert
    // them here they remain in order. no need to re-sort
    const categorizedSnippets = this.snippets.reduce((acc, { audience, ...rest }) => {
      if (rest.level === 'silent') {
        return acc;
      }
      if (!acc[audience]) {
        acc[audience] = [];
      }
      acc[audience].push(rest);
      return acc;
    }, {});

    const formattedSnippets = ALLOWED_AUDIENCES
      .map(audience => {
        if (!categorizedSnippets[audience]) {
          return '';
        }
        const snippets = categorizedSnippets[audience]
          .map(({ level, reference, body }) => (
            '▶ ' + levelLabels[level] +
            (reference ? ' ' + reference : '') + '\n' +
            body.trim()
          ))
          .join('\n\n');
        return `\n\n### ${audience.toUpperCase()}\n\n${snippets}`;
      }).join('').trim();

    const formattedUpdates = this.updates.length > 0 ? (
      [
        '\n',
        '### Automated Package Updates',
        '',
        '<details>',
        `<summary>${this.updates.length} Dependabot updates</summary>`,
        '', // without this newline, the list will not render correctly
      ]
        .concat(this.updates.map(u => `* ${u}`))
        .concat([
          '',
          '</details>',
        ])
        .join('\n')
    ) : '';

    return formattedSnippets + silentSuffix + formattedUpdates;
  }

  /**
   * Get a list of all snippet filenames, relative to the
   * root of the repository.
   */
  filenames() {
    return this.snippets.map(({ filename }) => filename);
  }
}

const check_pr = async (pr) => {
  const octokit = new Octokit();
  const options = octokit.pulls.listFiles.endpoint.merge({
    owner: 'taskcluster',
    repo: 'taskcluster',
    pull_number: pr,
  });
  const files = await octokit.paginate(options,
    response => response.data.map(({ filename }) => filename));

  // files that do not require a changelog entry if they are the only thing changed.  This
  // is similar to the list in .gitattributes., along with yarn and package.json
  const boringFiles = [
    /yarn\.lock$/,
    /package\.json$/,
    /requirements\.txt$/,
    /Cargo\.(lock|toml)$/,
    /^go\.(mod|sum)$/,
    /^\.yarn$/,
    /^README.md$/,
    /^\.all-contributorsrc/,
    /^\.taskcluster.yml/,
    /^infrastructure\//,
    /^generated\//,
    /^clients\/client-web\/src\/clients\//,
    /^clients\/client-py\/taskcluster\/generated\//,
    /^clients\/client-py\/README\.md$/,
    /^clients\/client-py\/uv\.lock$/,
    /^clients\/client\/src\/apis\.js$/,
    /^clients\/client-rust\/src\/generated\//,
    /^clients\/client-shell\/apis\/services\.go$/,
    /^dev-docs\/dev-config-example\.yml$/,
    /^clients\/client-go\/tc*\//,
    /^\.github\//,
  ];
  const hasImportantFiles = files.some(filename => boringFiles.every(r => !r.test(filename)));

  if (!hasImportantFiles) {
    console.log(`${chalk.bold.green(`PR ${pr} OK:`)} does not contain any changes requiring a changelog`);
    return true;
  }

  const changelogFiles = files.filter(filename => filename.startsWith('changelog/'));

  if (changelogFiles.some(filename => !filename.endsWith('.md'))) {
    console.log(`${chalk.bold.red('ERROR:')} Pull Request ${pr} has an invalid file in 'changelog/'. All files must be '.md'`);
    return false;
  }

  if (hasImportantFiles && !changelogFiles.length) {
    console.log(`${chalk.bold.red('ERROR:')} Pull Request ${pr} does not modify any files in 'changelog/'`);
    return false;
  }
  console.log(chalk.bold.green(`PR ${pr} OK`));
  return true;
};

export const add = async (options) => {
  let level, bad;
  if (options.major) {
    level = 'major';
  } else if (options.minor) {
    level = 'minor';
  } else if (options.patch) {
    level = 'patch';
  } else if (options.silent) {
    level = 'silent';
  } else {
    console.log('Must specify one of --major, --minor, --patch, or --silent');
    bad = true;
  }

  let audience;
  if (options.general) {
    audience = 'general';
  } else if (options.deployers) {
    audience = 'deployers';
  } else if (options.workerDeployers) {
    audience = 'worker-deployers';
  } else if (options.admins) {
    audience = 'admins';
  } else if (options.users) {
    audience = 'users';
  } else if (options.developers) {
    audience = 'developers';
  } else if (level === 'silent') { // We allow defaulting silent changes to `general` other levels _must_ specify
    audience = 'general';
  } else {
    console.log('Must specify one of --general, --deployers, --worker-deployers, --admins, --users, or --developers');
    bad = true;
  }

  let name, reference;
  if (options.issue) {
    name = `issue-${options.issue}`;
    reference = `reference: issue ${options.issue}\n`;
  } else if (options.bug) {
    name = `bug-${options.bug}`;
    reference = `reference: bug ${options.bug}\n`;
  } else if (options.bug === false || options.issue === false) {
    name = taskcluster.slugid();
    reference = '';
  } else {
    const { ref } = await gitCurrentBranch({ dir: REPO_ROOT });
    let m = ref.match(/(bug|issue)-?([0-9]+)/);
    if (m) {
      reference = `reference: ${m[1]} ${m[2]}\n`;
      name = `${m[1]}-${m[2]}`;
    } else {
      console.log('Must specify one of --issue, --bug, --no-issue, or --no-bug');
      bad = true;
    }
  }

  if (bad) {
    process.exit(1);
  }

  // invent a unique filename
  let filename, i = 0;
  while (1) {
    filename = path.join('changelog', `${name}${i > 0 ? `-${i}` : ''}.md`);
    try {
      await readRepoFile(filename);
    } catch (err) {
      if (err.code === 'ENOENT') {
        break;
      }
      throw err;
    }
    i++;
  }

  const helpText =
    '<!-- replace this text with your changelog entry.  See dev-docs/best-practices/changelog.md for help writing changelog entries. -->';
  await writeRepoFile(filename, `audience: ${audience}\nlevel: ${level}\n${reference}---\n${level === 'silent' ? '' : helpText}`);
  await gitAdd({ dir: REPO_ROOT, files: [filename] });
  console.log(`wrote ${filename}`);

  if (level !== 'silent') {
    openEditor([`${filename}:4`]);
  }
};

export const show = async (options) => {
  const cl = new ChangeLog({ skipUpdates: true });
  await cl.load();
  console.log(`${chalk.bold.cyan('Level:')}        ${cl.level()}`);
  console.log(`${chalk.bold.cyan('Next Version:')} ${await cl.nextVersion()}`);
  console.log(chalk.bold.cyan('Changelog:'));
  console.log(await cl.format());
};

export const check = async (options) => {
  const cl = new ChangeLog({ skipUpdates: true });
  await cl.load();
  console.log(chalk.bold.green('Changelog OK'));

  if (options.pr) {
    if (!(await check_pr(options.pr))) {
      process.exit(1);
    }
  }
};
