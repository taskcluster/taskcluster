const fs = require('fs');

const checks = [];
const targets = [];
const scopeExpression = { AllOf: [] };

/**
 * Each file in this directory is expected to export `tasks` containing a list of
 * console-taskgraph tasks.  It should also export a `scopeExpression` giving the
 * scopes it requires.
 *
 * The "main" task should provide (in `provides`) a requirement named `target-foo` for
 * some foo.
 */

fs.readdirSync(`${__dirname}/`).forEach(file => {
  if (file !== 'index.js' && file.match(/\.js$/)) {
    const exports = require(`./${file}`);

    for (let task of exports.tasks) {
      checks.push(task);
      for (let prov of task.provides) {
        if (prov.startsWith('target-')) {
          targets.push(prov.slice(7));
        }
      }
    }

    if (exports.scopeExpression) {
      scopeExpression.AllOf.push(exports.scopeExpression);
    } else {
      throw new Error(`${file} has no scopeExpression`);
    }
  }
});

exports.checks = checks;
exports.scopeExpression = scopeExpression;
exports.targets = targets;
