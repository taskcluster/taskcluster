const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {omit} = require('lodash');
const stream = require('stream');
const {LEVELS} = require('./logger');
const Monitor = require('./monitor');
const chalk = require('chalk');
const Debug = require('debug');
const plugins = require('./plugins');
const {cleanupDescription} = require('./util');

const REPO_ROOT = path.join(__dirname, '../../../');

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

const mmDebug = Debug('taskcluster-lib-monitor.MonitorManager');

class MonitorManager {
  /**
   * Register a new log message type.
   */
  static register({
    name,
    type,
    title,
    level,
    version,
    description,
    fields = {},
    serviceName,
  }) {
    assert(title, `Must provide a human readable title for this log type ${name}`);
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), `Invalid name type ${name}`);
    assert(/^[a-z][a-zA-Z0-9.\-_]*$/.test(type), `Invalid event type ${type}`);
    assert(!MonitorManager.types[name], `Cannot register event ${name} twice`);
    assert(level === 'any' || LEVELS[level] !== undefined, `${level} is not a valid level.`);
    assert(Number.isInteger(version), 'Version must be an integer');
    assert(!fields['v'], '"v" is a reserved field for messages');
    const cleaned = {};
    Object.entries(fields).forEach(([field, desc]) => {
      assert(/^[a-zA-Z0-9_]+$/.test(name), `Invalid field name ${name}.${field}`);
      cleaned[field] = cleanupDescription(desc);
    });
    mmDebug(`registering log type ${name} ${serviceName ? `for service ${serviceName}` : 'for all services'}`);
    MonitorManager.types[name] = {
      type,
      title,
      level,
      version,
      description: cleanupDescription(description),
      fields: cleaned,
      serviceName,
    };
  }

  /**
   * Set up an instance for production use.  This returns a root monitor
   * which can be used to create child monitors.
   */
  static setup({
    serviceName,
    level = 'info',
    patchGlobal = true,
    processName = null,
    monitorProcess = false,
    resourceInterval = 60,
    bailOnUnhandledRejection = true,
    fake = false,
    metadata = {},
    debug = false,
    destination = null,
    verify = false,
    errorConfig = null,
    versionOverride = null,
  }) {
    assert(serviceName, 'Must provide a serviceName to MonitorManager.setup');

    const manager = new MonitorManager();

    manager.types = MonitorManager._typesForService(serviceName);
    manager.serviceName = serviceName;

    // read dockerflow version file, if taskclusterVersion is not set
    if (manager.taskclusterVersion === undefined) {
      const taskclusterVersionFile = path.join(REPO_ROOT, 'version.json');
      try {
        manager.taskclusterVersion = JSON.parse(fs.readFileSync(taskclusterVersionFile).toString()).version;
      } catch (err) {
        // Do nothing, will just be undefined
      }
    }

    // in fake mode, don't monitor resources and errors
    if (fake) {
      patchGlobal = false;
      monitorProcess = false;
    }

    if (versionOverride) {
      manager.taskclusterVersion = versionOverride;
    }

    if (errorConfig) {
      if (!Object.keys(plugins.errorPlugins).includes(errorConfig.reporter)) {
        throw new Error(`Error reporter plugin ${errorConfig.reporter} does not exist.`);
      }
      manager._reporter = new plugins.errorPlugins[errorConfig.reporter]({
        ...errorConfig,
        serviceName: manager.serviceName,
        taskclusterVersion: manager.taskclusterVersion,
        processName,
      });
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
    manager.levels = levels;

    manager.fake = fake;
    manager.destination = destination;
    manager.debug = debug;
    if (destination) {
      assert(!fake && !debug, 'Cannot use fake/debug with a destination');
      assert(destination.write, 'Must provide writeable stream as destination');
    } else if (fake || debug) {
      manager.messages = [];
      manager.destination = new stream.Writable({
        write: (chunk, encoding, next) => {
          manager._handleMessage(JSON.parse(chunk));
          next();
        },
      });
    } else {
      manager.destination = process.stdout;
    }

    return new Monitor({
      manager,
      name: [],
      metadata,
      verify,
      fake,
      patchGlobal,
      bailOnUnhandledRejection,
      resourceInterval,
      processName,
      monitorProcess,
    });
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
  static reference(serviceName) {
    assert(serviceName, "serviceName is required");
    const types = MonitorManager._typesForService(serviceName);
    return {
      serviceName: serviceName,
      $schema: '/schemas/common/logs-reference-v0.json#',
      types: Object.entries(types).map(([name, type]) => {
        return {
          name,
          ...omit(type, ['serviceName']),
        };
      }).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Return the log types for the given serviceName
   */
  static _typesForService(serviceName) {
    return Object.assign(
      {},
      ...Object.entries(MonitorManager.types)
        .filter(([_, {serviceName: sn}]) => !sn || sn === serviceName)
        .map(([k, v]) => ({[k]: v})));
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
        s + chalk`\n\t{gray ${f}:} ${String(Fields[f]).replace(/\n/g, '\\n')}`, '');
      const line = chalk`${LEVELS_REVERSE_COLOR[Severity]}: {gray ${Type}}: ${message}${extra}`;
      Debug(Logger)(line);
    }
  }
}
MonitorManager.types = {};

module.exports = MonitorManager;
