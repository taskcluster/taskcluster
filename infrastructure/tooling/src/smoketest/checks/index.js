import path from 'path';
import { enumFiles } from '../../utils/load-tasks.js';

/**
 * Each file in this directory is expected to export `tasks` containing a list of
 * console-taskgraph tasks.  It should also export a `scopeExpression` giving the
 * scopes it requires.
 *
 * The "main" task should provide (in `provides`) a requirement named `target-foo` for
 * some foo.
 */

export const loadChecks = async (dirname) => {
  const checks = [];
  const scopeExpressions = { AllOf: [] };

  const files = enumFiles(dirname);

  await Promise.all(files.map(async (file) => {
    const { tasks, scopeExpression } = await import(path.join(dirname, file));
    tasks.forEach(task => {
      checks.push(task);

      if (scopeExpression) {
        scopeExpression.AllOf.push(scopeExpression);
      } else {
        throw new Error(`${file} has no scopeExpression`);
      }
    });
  }));

  return { checks, scopeExpression: scopeExpressions };
};
