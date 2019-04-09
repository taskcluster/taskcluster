const assert = require('assert');
const rootdir = require('app-root-dir');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const {Logger, LEVELS} = require('./logger');
const Monitor = require('./monitor');
const builtins = require('./builtins');

class MonitorManager {
  constructor({
    serviceName,
  }) {
    assert(serviceName, 'Must provide a serviceName to MonitorManager');
    this.serviceName = serviceName;
    this.types = {};
    builtins.forEach(builtin => this.register(builtin));
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
   * Register a new log message type
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

  /*
   * Initialize runtime dependencies that can't be preconfigured
   * and set up process-level monitoring.
   */
  setup({
    level = 'info',
    patchGlobal = true,
    bailOnUnhandledRejection = true,
    resourceInterval = 60,
    mock = false,
    enable = true,
    gitVersion = undefined,
    gitVersionFile = '../../.git-version', // To account for us being in a workspace
    processName = null,
    metadata = {},
    pretty = false,
    destination = null,
    verify = false,
  }) {
    if (this.alreadySetup) {
      return this;
    }
    this.alreadySetup = true;

    if (!enable || mock) {
      patchGlobal = false;
      processName = null;
      pretty = false;
    }

    this.mock = mock;
    this.pretty = pretty;
    this.subject = 'root';
    this.metadata = metadata;
    this.bailOnUnhandledRejection = bailOnUnhandledRejection;
    this.verify = verify;
    this.levels = {};
    this.gitVersion = gitVersion;

    if (level.includes(':')) {
      level.split(' ').reduce((o, conf) => {
        const c = conf.split(':');
        o[c[0]] = c[1];
        return o;
      }, this.levels);
      assert(this.levels['root'], 'Must specify `root:` level if using child-specific levels.');
    } else {
      this.levels['root'] = level;
    }

    if (destination) {
      assert(destination.write, 'Must provide writeable stream as destination');
      this.destination = destination;
    } else if (mock) {
      this.messages = [];
      this.destination = new stream.Writable({
        write: (chunk, encoding, next) => {
          try {
            const {Type, Fields, Logger} = JSON.parse(chunk);
            this.messages.push({Type, Fields, Logger});
          } catch (err) {
            if (err.name !== 'SyntaxError') {
              throw err;
            }
          }
          next();
        },
      });
    } else {
      this.destination = process.stdout;
    }

    // read gitVersionFile, if gitVersion is not set
    if (this.gitVersion === undefined) {
      gitVersionFile = path.resolve(rootdir.get(), gitVersionFile);
      try {
        this.gitVersion = fs.readFileSync(gitVersionFile).toString().trim();
      } catch (err) {
        // Do nothing, will just be undefined
      }
    }

    const logger = new Logger({
      name: `taskcluster.${this.serviceName}.${this.subject}`,
      service: this.serviceName,
      level: this.levels['root'],
      pretty,
      destination: this.destination,
      metadata,
      gitVersion: this.gitVersion,
    });

    this.rootMonitor = new Monitor({
      logger,
      verify,
      mock,
      enable,
      types: this.types,
    });

    if (patchGlobal) {
      this.uncaughtExceptionHandler = this._uncaughtExceptionHandler.bind(this);
      process.on('uncaughtException', this.uncaughtExceptionHandler);

      this.unhandledRejectionHandler = this._unhandledRejectionHandler.bind(this);
      process.on('unhandledRejection', this.unhandledRejectionHandler);
    }

    if (processName) {
      this.rootMonitor.resources(processName, resourceInterval);
    }

    return this;
  }

  _uncaughtExceptionHandler(err) {
    this.rootMonitor.reportError(err);
    process.exit(1);
  }

  _unhandledRejectionHandler(reason, p) {
    this.rootMonitor.reportError(reason);
    if (!this.bailOnUnhandledRejection) {
      return;
    }
    process.exit(1);
  }

  /*
   * Clear event listeners and timers from the monitor
   */
  terminate() {
    this.rootMonitor.stopResourceMonitoring();
    if (this.uncaughtExceptionHandler) {
      process.removeListener('uncaughtException', this.uncaughtExceptionHandler);
    }
    if (this.unhandledRejectionHandler) {
      process.removeListener('unhandledRejection', this.unhandledRejectionHandler);
    }
    if (this.mock) {
      this.destination.end();
    }
  }

  /*
   * For use in testing only. Clears the events so this can be used again.
   */
  reset() {
    if (!this.mock) {
      throw new Error('monitor.reset is only valid on mock monitors');
    }
    this.messages.splice(0);
  }

  /*
   * Get a prefixed monitor
   */
  monitor(prefix, metadata = {}) {
    assert(this.alreadySetup, 'Must setup() MonitorManager before getting monitors.');
    if (!prefix) {
      return this.rootMonitor;
    }
    prefix = `${this.subject}.${prefix}`;
    metadata = Object.assign({}, this.metadata, metadata);
    return new Monitor({
      types: this.types,
      verify: this.verify,
      mock: this.mock,
      enable: this.enable,
      logger: new Logger({
        name: `taskcluster.${this.serviceName}.${prefix}`,
        service: this.serviceName,
        level: this.levels[prefix] || this.levels.root,
        pretty: this.pretty,
        destination: this.destination,
        metadata,
        gitVersion: this.gitVersion,
      }),
    });
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
}

module.exports = MonitorManager;
