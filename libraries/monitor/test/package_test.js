suite('Package', () => {
  let assert = require('assert');
  let pack = require('../package.json');
  let exec = require('child_process');

  test('git tag must match package version', function() {
    let tag = exec.execSync('git tag -l --contains HEAD').toString().trim();
    if (tag === '') {
      console.log('    No git tag, no need to check tag!');
      this.skip();
    }
    assert.equal('v' + pack.version, tag);
  });

});
