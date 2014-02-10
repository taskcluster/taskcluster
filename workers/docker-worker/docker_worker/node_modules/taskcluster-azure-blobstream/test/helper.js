global.assert = require('assert');
require('mocha-as-promised')();

var account = process.env.AZURE_STORAGE_ACCOUNT;
var accessKey = process.env.AZURE_STORAGE_ACCESS_KEY;

if (!account || !accessKey) {
  console.error(
    'AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY must be set'
  );
  process.exit(1);
}

