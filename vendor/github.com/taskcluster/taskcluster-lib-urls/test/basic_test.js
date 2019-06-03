const fs = require('fs');
const path = require('path');
const assert = require('assert');
const yaml = require('js-yaml');
const libUrls = require('../');

const SPEC_FILE = path.join(__dirname, '../tests.yml');

suite('basic test', function() {

  var doc = yaml.safeLoad(fs.readFileSync(SPEC_FILE, {encoding: 'utf8'}));
  for (let t of doc['tests']) {
    for (let argSet of t['argSets']) {
      for (let cluster of Object.keys(doc['rootURLs'])) {
        for (let rootURL of doc['rootURLs'][cluster]) {
          test(`${t['function']} - ${argSet}`, function() {
            assert.equal(t['expected'][cluster], libUrls.withRootUrl(rootURL)[t['function']](...argSet));
            assert.equal(t['expected'][cluster], libUrls[t['function']](rootURL, ...argSet));  
          });
        }
      }
    }
  }
});
