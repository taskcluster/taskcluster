const yaml = require('js-yaml');
const glob = require('glob');
const appRootDir = require('app-root-dir');
const {readRepoFile} = require('../utils');

const ALLOWED_LEVELS = {
  'major': 1,
  'minor': 2,
  'patch': 3,
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
    const snippetFiles = glob.sync('changelog/*.mdx', {cwd: appRootDir.get()})
      .filter(filename => filename !== 'changelog/README.mdx');

    this.snippets = await Promise.all(snippetFiles.map(async filename => {
      const snippetContent = await readRepoFile(filename);
      const [headerYaml, body] = snippetContent.split('\n---\n', 2);

      if (!body || body.trim().length === 0) {
        throw new Error(`Snippet ${filename} is malformed or has no body`);
      }

      let {level, reference, ...extra} = yaml.safeLoad(headerYaml);
      if (Object.keys(extra).length !== 0) {
        throw new Error(`Snippet ${filename}: extra properties in header`);
      }

      if (!level || !ALLOWED_LEVELS[level]) {
        throw new Error(`Snippet ${filename}: invalid level`);
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
   * Get the formatted list of snippets as a string
   */
  format() {
    if (this.snippets.length === 0) {
      return 'No changes';
    }

    const levelLabels = {
      'major': '[MAJOR] ',
      'minor': '[minor] ',
      'patch': '',
    };
    return this.snippets
      .map(({level, reference, body}) => (
        levelLabels[level] +
        (reference ? '(' + reference + ') ' : '') +
        body.trim()
      ))
      .join('\n\n');
  }

  /**
   * Get a list of all snippet filenames, relative to the
   * root of the repository.
   */
  filenames() {
    return this.snippets.map(({filename}) => filename);
  }
}

const main = async (options) => {
  const cl = new ChangeLog();
  await cl.load();
  console.log(cl.format());
};

module.exports = {main, ChangeLog};
