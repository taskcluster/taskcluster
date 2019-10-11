const fs = require('fs');

const checks = [];
const scopeExpression = {AllOf: []};

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
    exports.tasks.forEach(val => checks.push(val));
    if (exports.scopeExpression) {
      scopeExpression.AllOf.push(exports.scopeExpression);
    }
  }
});

exports.checks = checks;
exports.scopeExpression = scopeExpression;
