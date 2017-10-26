/**
 * This feature adjusts the AppArmor profile to allow ptrace within a container.
 * All of the interesting action takes place in `lib/task.js`.
 */

const { scopeMatch } = require('taskcluster-base/utils');

// Prefix used in scope matching for docker-worker features
const FEATURE_SCOPE_PREFIX = 'docker-worker:feature:';

class AllowPtrace {
  constructor() {
    this.featureName = 'allowPtrace';
  }

  async link(task) {
    let featureScope = FEATURE_SCOPE_PREFIX + this.featureName;
    if (!scopeMatch(task.task.scopes, [[featureScope]])) {
      throw new Error(
        `Insufficient scopes to use '${this.featureName}' feature.  ` +
        `Try adding ${featureScope} to the .scopes array.`
      );
    }
  }
}

module.exports = AllowPtrace;
