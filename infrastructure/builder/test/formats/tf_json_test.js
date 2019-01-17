const fs = require('fs');
const util = require('util');
const path = require('path');
const temporary = require('temporary');
const rimraf = util.promisify(require('rimraf'));
const assume = require('assume');
const {ClusterSpec} = require('../../src/formats/cluster-spec');
const {TerraformJson} = require('../../src/formats/tf-json');

suite('TerraformJson', function() {
  let tempDir;

  const makeTempDir = content => {
    tempDir = new temporary.Dir();
    return tempDir.path;
  };

  teardown(async function() {
    if (tempDir) {
      await rimraf(tempDir.path);
      tempDir = null;
    }
  });

  test('load cluster spec from directory', function() {
    const cs = new ClusterSpec(path.join(__dirname, 'example'));
    const filename = path.join(makeTempDir(), 'out.tf.json');
  });
});
