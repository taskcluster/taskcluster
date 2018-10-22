const assert = require('assert');
const pack = require('../package.json');
const exec = require('child_process');

suite('Package', () => {
  test('git tag must match package version', function() {
    const tag = exec.execSync('git tag -l --contains HEAD').toString().trim();
    if (tag === '') {
      console.log('    No git tag, no need to check tag!');
      this.skip();
    }
    assert.equal('v' + pack.version, tag);
  });

});
