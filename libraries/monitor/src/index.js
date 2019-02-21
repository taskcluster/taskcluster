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

  /*
   * Register a new log message type
   */
  register({
    name,
    type,
    level,
    version,
    description,
    fields = {}, // TODO: Consider making these defined with json-schema and validate only in dev or something
  }) {
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), `Invalid name type ${name}`);
    assert(/^[a-z][a-z0-9.-_]*$/.test(type), `Invalid event type ${type}`);
    assert(!this.types[name], `Cannot register event ${name} twice`);
    assert(LEVELS[level] !== undefined, `${level} is not a valid level.`);
    assert(Number.isInteger(version), 'Version must be an integer');
    Object.entries(fields).forEach((field, desc) => {
      assert(/^[a-zA-Z0-9_]+$/.test(name), `Invalid field name ${name}.${field}`);
    });
    this.types[name] = {
      type,
      level,
      version,
      description,
      fields,
    };
  }

  /*
   * Initialize runtime dependencies that can't be preconfigured
   * and set up process-level monitoring.
   */
  setup({
    level = 'info',
    patchGlobal = true,
    bailOnUnhandledRejection = false,
    resourceInterval = 10,
    mock = false,
    enable = true,
    gitVersionFile = '.git-version',
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

    if (!enable) {
      patchGlobal = false;
      processName = null;
    }

    this.mock = mock;
    this.enable = enable;
    this.pretty = pretty;
    this.subject = 'root';
    this.metadata = metadata;
    this.bailOnUnhandledRejection = bailOnUnhandledRejection;
    this.verify = verify;
    this.levels = {};

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
            chunk = JSON.parse(chunk);
          } catch (err) {
            if (err.name !== 'SyntaxError') {
              throw err;
            }
          }
          this.messages.push(chunk);
          next();
        },
      });
    } else {
      this.destination = process.stdout;
    }

    // read gitVersionFile, if gitVersion is not set
    if (!metadata.gitVersion) {
      gitVersionFile = path.resolve(rootdir.get(), gitVersionFile);
      try {
        metadata.gitVersion = fs.readFileSync(gitVersionFile).toString().trim();
      } catch (err) {
        delete metadata.gitVersion;
      }
    }

    const logger = new Logger({
      name: `taskcluster.${this.serviceName}.${this.subject}`,
      level: this.levels['root'],
      enable,
      pretty,
      destination: this.destination,
      metadata,
    });

    this.rootMonitor = new Monitor({
      logger,
      verify,
      enable,
      types: this.types,
    });

    if (patchGlobal && enable) {
      this.uncaughtExceptionHandler = this._uncaughtExceptionHandler.bind(this);
      process.on('uncaughtException', this.uncaughtExceptionHandler);

      this.unhandledRejectionHandler = this._unhandledRejectionHandler.bind(this);
      process.on('unhandledRejection', this.unhandledRejectionHandler);
    }

    if (processName && !mock && enable) {
      this.rootMonitor.resources(processName, resourceInterval);
    }

    return this;
  }

  _uncaughtExceptionHandler(err) {
    this.rootMonitor.reportError(err);
    process.exit(1);
  }

  _unhandledRejectionHandler(reason, p) {
    const err = 'Unhandled Rejection at: Promise ' + p + ' reason: ' + reason;
    this.rootMonitor.reportError(err);
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
    process.removeListener('uncaughtException', this.uncaughtExceptionHandler);
    process.removeListener('unhandledRejection', this.unhandledRejectionHandler);
    if (this.mock) {
      this.destination.end();
    }
  }

  /*
   * For use in testing only. Clears the events so this can be used again.
   */
  reset() {
    this.messages = [];
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
      enable: this.enable,
      logger: new Logger({
        name: `taskcluster.${this.serviceName}.${prefix}`,
        level: this.levels[prefix] || this.levels.root,
        enable: this.enable,
        pretty: this.pretty,
        destination: this.destination,
        metadata,
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
      types: Object.values(this.types).map(type => {
        return {
          name: type.name,
          type: type.type,
          version: type.version,
          description: type.description,
          fields: type.fields,
        };
      }),
    };
  }
}

module.exports = MonitorManager;
