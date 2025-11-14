import { gitLsFiles, readRepoFile } from '../../utils/index.js';
import * as acorn from 'acorn-loose';
import * as walk from 'acorn-walk';
import path from 'path';

export const tasks = [];

/**
 * Extract string value from a Literal node
 */
const getLiteralValue = (node) => {
  if (node && node.type === 'Literal') {
    return node.value;
  }
  return null;
};

/**
 * Extract array of strings from an ArrayExpression node
 */
const getArrayValues = (node) => {
  if (node && node.type === 'ArrayExpression') {
    return node.elements
      .map(elem => getLiteralValue(elem))
      .filter(val => val !== null);
  }
  return [];
};

/**
 * Extract object properties from an ObjectExpression node
 */
const getObjectProperties = (node) => {
  if (node && node.type === 'ObjectExpression') {
    const obj = {};
    for (const prop of node.properties) {
      if (prop.type === 'Property' && prop.key) {
        const key = prop.key.name || getLiteralValue(prop.key);
        if (key) {
          if (prop.value.type === 'ArrayExpression') {
            obj[key] = getArrayValues(prop.value);
          } else if (prop.value.type === 'Literal') {
            obj[key] = getLiteralValue(prop.value);
          }
        }
      }
    }
    return obj;
  }
  return {};
};

/**
 * Parse a monitor.js file and extract metric registrations
 */
const parseMetricRegistrations = async (file) => {
  const content = await readRepoFile(file);
  const ast = acorn.parse(content);
  const metrics = [];
  const logTypes = [];

  walk.simple(ast, {
    CallExpression(node) {
      // Check for MonitorManager.registerMetric(id, config)
      if (
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object &&
        node.callee.object.name === 'MonitorManager' &&
        node.callee.property &&
        node.callee.property.name === 'registerMetric'
      ) {
        const metricId = getLiteralValue(node.arguments[0]);
        const config = getObjectProperties(node.arguments[1]);

        if (metricId) {
          metrics.push({
            id: metricId,
            name: config.name || null,
            registers: config.registers || ['default'],
          });
        }
      }

      // Check for MonitorManager.register({ name: '...', ... })
      if (
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object &&
        node.callee.object.name === 'MonitorManager' &&
        node.callee.property &&
        node.callee.property.name === 'register'
      ) {
        const config = getObjectProperties(node.arguments[0]);

        if (config.name) {
          logTypes.push({
            name: config.name,
            type: config.type || null,
          });
        }
      }
    },
  });

  return { metrics, logTypes };
};

/**
 * Parse an exchanges.js file and extract exchange declarations
 */
const parseExchangeDeclarations = async (file) => {
  const content = await readRepoFile(file);
  const ast = acorn.parse(content);
  const exchanges = [];

  walk.simple(ast, {
    CallExpression(node) {
      // Check for exchanges.declare({ name: '...', ... })
      if (
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object &&
        node.callee.object.name === 'exchanges' &&
        node.callee.property &&
        node.callee.property.name === 'declare'
      ) {
        const config = getObjectProperties(node.arguments[0]);

        if (config.name) {
          exchanges.push({
            name: config.name,
            exchange: config.exchange || null,
          });
        }
      }
    },
  });

  return exchanges;
};

/**
 * Parse a main.js file and extract exposeMetrics calls
 */
const parseExposeMetrics = async (file) => {
  const content = await readRepoFile(file);
  const ast = acorn.parse(content);
  const exposedRegisters = new Set();

  walk.simple(ast, {
    CallExpression(node) {
      // Check for .exposeMetrics('registerName')
      if (
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property &&
        node.callee.property.name === 'exposeMetrics'
      ) {
        const registerName = getLiteralValue(node.arguments[0]);
        if (registerName) {
          exposedRegisters.add(registerName);
        }
      }
    },
  });

  return exposedRegisters;
};

/**
 * Check if a metric/log type/exchange is used in service source files
 * Excludes monitor.js and exchanges.js to avoid false positives from the registration/declaration itself
 */
const isUsedInService = async (serviceName, regex) => {
  const files = await gitLsFiles({ patterns: [`services/${serviceName}/src/**.js`] });

  // Exclude monitor.js and exchanges.js since they contain the registration/declaration definitions
  const filesToCheck = files.filter(file =>
    !file.endsWith('/monitor.js') && !file.endsWith('/exchanges.js')
  );

  for (const file of filesToCheck) {
    const content = await readRepoFile(file);

    if (regex.test(content)) {
      return true;
    }
  }

  return false;
};

/**
 * Validate metrics for a single service
 */
const validateService = async (serviceName, utils) => {
  const errors = [];

  utils.status({ message: `Checking service: ${serviceName}` });

  // Parse monitor.js if it exists
  const monitorFile = `services/${serviceName}/src/monitor.js`;
  let monitorExists = false;

  try {
    await readRepoFile(monitorFile);
    monitorExists = true;
  } catch (e) {
    // No monitor.js file, skip this service
    return errors;
  }

  const { metrics, logTypes } = await parseMetricRegistrations(monitorFile);

  // Check 1: Verify registered metrics are used
  for (const metric of metrics) {
    // Escape the metric ID for use in regex
    const escapedId = metric.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Be strict: require the exact pattern .metric.metricId(
    const pattern = new RegExp(`\\.metric\\.${escapedId}\\(`);
    const isUsed = await isUsedInService(serviceName, pattern);

    if (!isUsed) {
      errors.push(
        `Service '${serviceName}': Metric '${metric.id}' is registered but never used. ` +
        `Expected to find '.metric.${metric.id}(' in service source files (excluding monitor.js).`
      );
    }
  }

  // Check 2: Verify metric registers are exposed
  const mainFile = `services/${serviceName}/src/main.js`;
  let exposedRegisters = new Set();

  try {
    exposedRegisters = await parseExposeMetrics(mainFile);
  } catch (e) {
    // No main.js or failed to parse, skip register check
  }

  for (const metric of metrics) {
    for (const register of metric.registers) {
      if (!exposedRegisters.has(register)) {
        errors.push(
          `Service '${serviceName}': Metric '${metric.id}' uses register '${register}' ` +
          `but it is never exposed. Add 'monitor.exposeMetrics('${register}')' in main.js.`
        );
      }
    }
  }

  // Check 3: Verify log types are used
  for (const logType of logTypes) {
    // Escape the log type name for use in regex
    const escapedName = logType.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Be strict: require the exact pattern .logTypeName(
    const pattern = new RegExp(`\\.${escapedName}\\(`);
    const isUsed = await isUsedInService(serviceName, pattern);

    if (!isUsed) {
      errors.push(
        `Service '${serviceName}': Log type '${logType.name}' is registered but never used. ` +
        `Expected to find '.${logType.name}(' in service source files (excluding monitor.js).`
      );
    }
  }

  // Check 4: Verify exchanges are used
  const exchangesFile = `services/${serviceName}/src/exchanges.js`;
  let exchangesExist = false;

  try {
    await readRepoFile(exchangesFile);
    exchangesExist = true;
  } catch (e) {
    // No exchanges.js file, skip this check
  }

  if (exchangesExist) {
    const exchanges = await parseExchangeDeclarations(exchangesFile);

    for (const exchange of exchanges) {
      // Escape the exchange name for use in regex
      const escapedName = exchange.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Be strict: require the exact pattern publisher.exchangeName(
      const pattern = new RegExp(`publisher\\.${escapedName}\\(`);
      const isUsed = await isUsedInService(serviceName, pattern);

      if (!isUsed) {
        errors.push(
          `Service '${serviceName}': Exchange '${exchange.name}' is declared but never used. ` +
          `Expected to find 'publisher.${exchange.name}(' in service source files (excluding exchanges.js).`
        );
      }
    }
  }

  return errors;
};

tasks.push({
  title: 'Metrics, log types, and exchanges are properly registered and used',
  requires: [],
  provides: [],
  run: async (requirements, utils) => {
    utils.status({ message: 'Finding all services...' });

    // Get all services with monitor.js or exchanges.js files
    const monitorFiles = await gitLsFiles({ patterns: ['services/*/src/monitor.js'] });
    const exchangeFiles = await gitLsFiles({ patterns: ['services/*/src/exchanges.js'] });

    const servicesSet = new Set();
    [...monitorFiles, ...exchangeFiles].forEach(file => {
      const match = file.match(/services\/([^/]+)\//);
      if (match) {
        servicesSet.add(match[1]);
      }
    });

    const services = Array.from(servicesSet);
    utils.status({ message: `Found ${services.length} services with monitor.js or exchanges.js` });

    // Validate each service
    const allErrors = [];
    for (const serviceName of services) {
      const errors = await validateService(serviceName, utils);
      allErrors.push(...errors);
    }

    // Report all errors
    if (allErrors.length > 0) {
      throw new Error(
        `Found ${allErrors.length} metric/log type/exchange validation error(s):\n\n` +
        allErrors.map((err, idx) => `${idx + 1}. ${err}`).join('\n')
      );
    }

    utils.status({ message: `All metrics, log types, and exchanges validated successfully across ${services.length} services` });
  },
});
