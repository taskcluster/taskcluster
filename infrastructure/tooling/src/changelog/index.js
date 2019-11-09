const yaml = require('js-yaml');
const semver = require('semver');
const glob = require('glob');
const chalk = require('chalk');
const appRootDir = require('app-root-dir');
const {REPO_ROOT, readRepoFile, readRepoJSON, writeRepoFile, gitAdd} = require('../utils');
const taskcluster = require('taskcluster-client');
const path = require('path');
const openEditor = require('open-editor');
const Octokit = require("@octokit/rest");

const ALLOWED_LEVELS = {
  'major': 1,
  'minor': 2,
  'patch': 3,
  'silent': 4,
};

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
 */
class ChangeLog {
  constructor() {
    this.loaded = false;
    this.snippets = [];
  }

  async load() {
    const snippetFiles = glob.sync('changelog/*.md', {cwd: appRootDir.get()})
      .filter(filename => filename !== 'changelog/README.md');

    this.snippets = await Promise.all(snippetFiles.map(async filename => {
      const snippetContent = await readRepoFile(filename);
      const [headerYaml, body] = snippetContent.split('\n---\n', 2);

      let {level, reference, ...extra} = yaml.safeLoad(headerYaml);
      if (Object.keys(extra).length !== 0) {
        throw new Error(`Snippet ${filename}: extra properties in header`);
      }

      if (!level || !ALLOWED_LEVELS[level]) {
        throw new Error(`Snippet ${filename}: invalid level`);
      }

      if (level !== 'silent' && (!body || body.trim().length === 0)) {
        throw new Error(`Snippet ${filename} is malformed or has no body`);
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

      return {filename, level, reference, body};
    }));

    const cmp = (a, b) => {
      return levelcmp(a.level, b.level) || strcmp(a.body, b.body);
    };

    this.snippets.sort(cmp);
  }

  /**
   * Get the highest snippet level, determining the overall level
   * of this release.
   */
  level() {
    let minor = false;
    for (let {level} of this.snippets) {
      if (level === 'major') {
        return 'major';
      }
      if (level === 'minor') {
        minor = true;
      }
    }
    return minor ? 'minor' : 'patch';
  }

  /**
   * Get the next version number, given the current level.
   */
  async next_version() {
    const pkgJson = await readRepoJSON('package.json');
    return semver.inc(pkgJson.version, this.level());
  }

  /**
   * Get the formatted list of snippets as a string
   */
  async format() {
    if (this.snippets.length === 0) {
      return 'No changes';
    }

    const levelLabels = {
      'major': '[MAJOR] ',
      'minor': '[minor] ',
      'patch': '[patch] ',
    };

    const silent = this.snippets.filter(sn => sn.level === 'silent' && sn.reference);
    const silentCount = silent.length;
    const silentLinks = silent.map(sn => sn.reference).join(', ');
    const silentSuffix = silentCount === 0 ?
      '' :
      `\n\n▶ Additional change${silentCount === 1 ? '' : 's'} not described here: ${silentLinks}.`;

    return this.snippets
      .filter(sn => sn.level !== 'silent')
      .map(({level, reference, body}) => (
        '▶ ' + levelLabels[level] +
        (reference ? reference : '') + '\n' +
        body.trim()
      ))
      .join('\n\n') + silentSuffix;
  }

  /**
   * Get a list of all snippet filenames, relative to the
   * root of the repository.
   */
  filenames() {
    return this.snippets.map(({filename}) => filename);
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
    response => response.data.map(({filename}) => filename));

  // files that do not require a changelog entry if they are the only thing changed.  This
  // is similar to the list in .gitattributes., along with yarn and package.json
  const boringFiles = [
    /yarn\.lock$/,
    /package\.json$/,
    /^\.yarn$/,
    /^\.taskcluster.yml/,
    /^infrastructure\//,
    /^generated\//,
    /^clients\/client-web\/src\/clients\//,
    /^clients\/client-py\/taskcluster\/generated\//,
    /^clients\/client-py\/README\.md$/,
    /^clients\/client\/src\/apis\.js$/,
    /^services\/*\/Procfile$/,
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

  const hasChangelog = files.some(filename => filename.startsWith('changelog/'));

  if (hasImportantFiles && !hasChangelog) {
    console.log(`${chalk.bold.red('ERROR:')} Pull Request ${pr} does not modify any files in 'changelog/'`);
    return false;
  }
  console.log(chalk.bold.green(`PR ${pr} OK`));
  return true;
};

const add = async (options) => {
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

  let name, reference;
  if (options.issue) {
    name = `issue-${options.issue}`;
    reference = `reference: issue ${options.issue}\n`;
  } else if (options.bug) {
    name = `bug-${options.bug}`;
    reference = `reference: bug ${options.bug}\n`;
  } else if (options.bug === false) {
    name = taskcluster.slugid();
    reference = '';
  } else {
    console.log('Must specify one of --issue, --bug, or --no-bug');
    bad = true;
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
  await writeRepoFile(filename, `level: ${level}\n${reference}---\n${level === 'silent' ? '' : helpText}`);
  await gitAdd({dir: REPO_ROOT, files: [filename]});
  console.log(`wrote ${filename}`);

  if (level !== 'silent') {
    openEditor([`${filename}:4`]);
  }
};

const show = async (options) => {
  const cl = new ChangeLog();
  await cl.load();
  console.log(`${chalk.bold.cyan('Level:')}        ${cl.level()}`);
  console.log(`${chalk.bold.cyan('Next Version:')} ${await cl.next_version()}`);
  console.log(chalk.bold.cyan('Changelog:'));
  console.log(await cl.format());
};

const check = async (options) => {
  const cl = new ChangeLog();
  await cl.load();
  console.log(chalk.bold.green('Changelog OK'));

  if (options.pr) {
    if (!await check_pr(options.pr)) {
      process.exit(1);
    }
  }
};

module.exports = {add, show, check, ChangeLog};
