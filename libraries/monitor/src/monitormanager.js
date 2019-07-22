const assert = require('assert');
const rootdir = require('app-root-dir');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const {LEVELS} = require('./logger');
const Monitor = require('./monitor');
const chalk = require('chalk');
const Debug = require('debug');

const LEVELS_REVERSE_COLOR = [
  chalk.red.bold('EMERGENCY'),
  chalk.red.bold('ALERT'),
  chalk.red.bold('CRITICAL'),
  chalk.red('ERROR'),
  chalk.yellow('WARNING'),
  chalk.blue('NOTICE'),
  chalk.green('INFO'),
  chalk.magenta('DEBUG'),
];

class MonitorManager {
  constructor() {
    this.types = {};
  }

  /**
   * Configure this instance; this sets some per-service details.  It
   * must be called only once per process.
   */
  configure({serviceName}) {
    assert(!this._configured, 'MonitorManager is already configured');

    assert(serviceName, 'Must provide a serviceName to MonitorManager.configure');
    this.serviceName = serviceName;
    // read dockerflow version file, if taskclusterVersion is not set
    if (this.taskclusterVersion === undefined) {
      const taskclusterVersionFile = path.resolve(rootdir.get(), '../../version.json');
      try {
        this.taskclusterVersion = JSON.parse(fs.readFileSync(taskclusterVersionFile).toString()).version;
      } catch (err) {
        // Do nothing, will just be undefined
      }
    }

    this._configured = true;
    return this;
  }

  /**
   * Register a new log message type.  This can be called on the static
   * defaultMonitorManager by any code at module load time.
   */
  register({
    name,
    type,
    title,
    level,
    version,
    description,
    fields = {}, // TODO: Consider making these defined with json-schema and validate only in dev or something
  }) {
    assert(!this._setup, 'Cannot register after MonitorManager has been setup');
    assert(title, `Must provide a human readable title for this log type ${name}`);
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), `Invalid name type ${name}`);
    assert(/^[a-z][a-zA-Z0-9.\-_]*$/.test(type), `Invalid event type ${type}`);
    assert(!this.types[name], `Cannot register event ${name} twice`);
    assert(level === 'any' || LEVELS[level] !== undefined, `${level} is not a valid level.`);
    assert(Number.isInteger(version), 'Version must be an integer');
    assert(!fields['v'], '"v" is a reserved field for messages');
    const cleaned = {};
    Object.entries(fields).forEach(([field, desc]) => {
      assert(/^[a-zA-Z0-9_]+$/.test(name), `Invalid field name ${name}.${field}`);
      cleaned[field] = this.cleanupDescription(desc);
    });
    this.types[name] = {
      type,
      title,
      level,
      version,
      description: this.cleanupDescription(description),
      fields: cleaned,
    };
  }

  /**
   * Set up this instance for production use.  This returns a root monitor
   * which can be used to create child monitors.  This can be called multiple
   * times in the same process.
   */
  setup({
    level = 'info',
    patchGlobal = true,
    processName = null,
    resourceInterval = 60,
    bailOnUnhandledRejection = true,
    fake = false,
    metadata = {},
    debug = false,
    destination = null,
    verify = false,
  }) {
    assert(this._configured, 'must call configure(..) before setup(..)');
    assert(!this._setup, 'must not call setup(..) more than once');
    this._setup = true;

    // in fake mode, don't monitor resources and errors
    if (fake) {
      patchGlobal = false;
      processName = null;
    }

    const levels = {};
    if (level.includes(':')) {
      level.split(' ').reduce((o, conf) => {
        const c = conf.split(':');
        o[c[0]] = c[1];
        return o;
      }, levels);
      assert(levels['root'], 'Must specify `root:` level if using child-specific levels.');
    } else {
      levels['root'] = level;
    }
    this.levels = levels;

    this.fake = fake;
    this.destination = destination;
    this.debug = debug;
    if (destination) {
      assert(!fake && !debug, 'Cannot use fake/debug with a destination');
      assert(destination.write, 'Must provide writeable stream as destination');
    } else if (fake || debug) {
      this.messages = [];
      this.destination = new stream.Writable({
        write: (chunk, encoding, next) => {
          this._handleMessage(JSON.parse(chunk));
          next();
        },
      });
    } else {
      this.destination = process.stdout;
    }

    return new Monitor({
      manager: this,
      name: [],
      metadata,
      verify,
      fake,
      patchGlobal,
      bailOnUnhandledRejection,
      resourceInterval,
      processName,
    });
  }

  /**
   * Remove leading trailing cruft and dedent evenly any multiline
   * strings that were passed in with their indentation intact.
   *
   * Example:
   *
   * let x = `Foo
   *          bar
   *          baz`;
   *
   * Normally this prints as:
   *
   * Foo
   *         bar
   *         baz
   *
   * But after using this, it is:
   *
   * Foo
   * bar
   * baz
   */
  cleanupDescription(desc) {
    desc = desc.trim();
    const spl = desc.split('\n');

    if (spl.length < 2) {
      return desc;
    }

    const match = /^\s+/.exec(spl[1]); // The first line has already been trimmed
    if (match) {
      const remove = match[0].length;
      const fixed = spl.slice(1).map(l => l.slice(remove));
      return [spl[0], ...fixed].join('\n');
    }

    return desc;
  }

  /*
   * For use in testing only. Clears the events so this can be used again.
   */
  reset() {
    this.messages.splice(0);
  }

  /*
   * Generate log message documentation
   */
  reference() {
    return {
      serviceName: this.serviceName,
      $schema: '/schemas/common/logs-reference-v0.json#',
      types: Object.entries(this.types).map(([name, type]) => {
        return {
          name,
          ...type,
        };
      }),
    };
  }

  /**
   * Handle a message from any logger. This is only used in testing
   * and development.
   */
  _handleMessage({Type, Fields, Logger, Severity, severity, message}) {
    if (this.fake) {
      this.messages.push({Type, Fields, Logger, Severity});
    }
    if (this.debug) {
      message = message ? message.toString().replace(/\n/g, '\\n') : '';
      const extra = Object.keys(Fields).reduce((s, f) =>
        s + chalk`\n\t{gray ${f}:} ${Fields[f].toString().replace(/\n/g, '\\n')}`, '');
      const line = chalk`${LEVELS_REVERSE_COLOR[Severity]}: {gray ${Type}}: ${message}${extra}`;
      Debug(Logger)(line);
    }
  }
}

module.exports = MonitorManager;
