/* global __karma__ */

/**
 * Set helper.rootUrl to the test rootUrl, or skip the suite if this is not
 * available.  Note that the rootUrl shouldn't be used at the suite level, as
 * it will not be set yet.
 */
exports.withRootUrl = function() {
  before(function() {
    // the rootUrl is passed in via karma.conf.js
    exports.rootUrl = __karma__.config.args[0];
    if (!exports.rootUrl) {
      console.log('TASKCLUSTER_ROOT_URL not set');
      if (process.env.NO_TEST_SKIP) {
        throw new Error('TASKCLUSTER_ROOT_URL not set but NO_TEST_SKIP is set');
      } else {
        this.skip();
      }
    }
  });

  after(function() {
    exports.rootUrl = undefined;
  });
};
