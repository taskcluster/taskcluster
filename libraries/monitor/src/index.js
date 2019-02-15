const assert = require('assert');
const rootdir = require('app-root-dir');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const Logger = require('./logger');
const Monitor = require('./monitor');

class MonitorBuilder {
  constructor({
    projectName,
  }) {
    assert(projectName, 'Must provide a project name to MonitorBuilder');
    this.projectName = projectName;
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
  }) {
    if (this.alreadySetup) {
      throw new Error('Cannot double setup MonitorBuilder');
    }
    this.alreadySetup = true;

    this.mock = mock;
    this.enable = enable;
    this.pretty = pretty;
    this.subject = 'root';
    this.metadata = metadata;
    this.bailOnUnhandledRejection = bailOnUnhandledRejection;

    if (level.includes(':')) {
      this.levels = level.split(' ').reduce((o, conf) => {
        const c = conf.split(':');
        o[c[0]] = c[1];
        return o;
      }, {});
      assert(this.levels['root'], 'Must specify `root:` level if using child-specific levels.');
    } else {
      this.level = level;
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
      name: `${this.projectName}.${this.subject}`,
      level: this.levels ? this.levels.root : this.level,
      enable,
      pretty,
      destination: this.destination,
      metadata,
    });

    this.rootMonitor = new Monitor({
      logger,
    });

    if (patchGlobal) {
      this.uncaughtExceptionHandler = this._uncaughtExceptionHandler.bind(this);
      process.on('uncaughtException', this.uncaughtExceptionHandler);

      this.unhandledRejectionHandler = this._unhandledRejectionHandler.bind(this);
      process.on('unhandledRejection', this.unhandledRejectionHandler);
    }

    if (processName && !mock) {
      this.rootMonitor.resources(processName, resourceInterval);
    }
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
    assert(this.alreadySetup, 'Must setup() MonitorBuilder before getting monitors.');
    if (!prefix) {
      return this.rootMonitor;
    }
    prefix = `${this.subject}.${prefix}`;
    metadata = Object.assign({}, this.metadata, metadata);
    return new Monitor({
      logger: new Logger({
        name: `${this.projectName}.${prefix}`,
        level: this.levels ? this.levels[prefix] || this.levels.root : this.level,
        enable: this.enable,
        pretty: this.pretty,
        destination: this.destination,
        metadata,
      }),
    });
  }

}

module.exports = MonitorBuilder;
