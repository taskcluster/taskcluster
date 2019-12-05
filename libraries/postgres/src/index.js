// Overall plan is: access is only through plpgsql functions, and those must
// have a consistent API (args + result).  Upgrades can redefine these
// functions and add new functions, but not change API as existing software may
// be using those functions concurrently.

exports.Schema = require('./Schema');
exports.Database = require('./Database');
module.exports = {...exports, ...require('./constants')};
