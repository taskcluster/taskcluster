const fs = require('fs');
const util = require('util');
const path = require('path');
const temporary = require('temporary');
const rimraf = util.promisify(require('rimraf'));
const assume = require('assume');
const {ClusterSpec} = require('../../src/formats/cluster-spec');

suite('ClusterSpec', function() {
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

  test('load deploy spec from directory', function() {
    const cs = new ClusterSpec(path.join(__dirname, 'example'));
    assume(cs.build.services[0].name).to.equal('ping');
  });

  test('write deploy as JSON', function() {
    const cs = new ClusterSpec(path.join(__dirname, 'example'));
    const filename = path.join(makeTempDir(), 'cs.json');
    cs.write(filename);
    const written = JSON.parse(fs.readFileSync(filename));
    assume(written.build).to.deeply.equal(cs.build);
  });

  test('read deploy as JSON', function() {
    const filename = path.join(makeTempDir(), 'cs.json');
    fs.writeFileSync(filename, JSON.stringify({build: 'b', deploy: 'd'}));
    const cs = new ClusterSpec(filename);
    assume(cs.build).to.equal('b');
  });
});
