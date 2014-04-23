/**
Defaults for the treeherder service.
*/
module.exports = {
  baseUrl: process.env.TREEHERDER_URL ||
           'http://treeherder-dev.allizom.org/api/'
};
