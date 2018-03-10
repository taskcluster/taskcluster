const fs = require('fs');
const util = require('util');
const path = require('path');
const temporary = require('temporary');
const rimraf = util.promisify(require('rimraf'));
const assume = require('assume');
const {BuildSpec, VERSION} = require('../../src/formats/build-spec');

const VALID_BUILD_SPEC = [
  'version: 1',
  'docker:',
  '  repositoryPrefix: testing/taskcluster-',
  'services:',
  '  - name: ping',
  '    source: https://github.com/djmitche/taskcluster-ping#master',
].join('\n');

suite('BuildSpec', function() {
  let tempDir;

  const makeBuildSpec = content => {
    tempDir = new temporary.Dir();
    fs.writeFileSync(path.join(tempDir.path, 'main.yml'), content);
    return tempDir.path;
  };

  teardown(async function() {
    if (tempDir) {
      await rimraf(tempDir.path);
      tempDir = null;
    }
  });

  test('valid build spec', function() {
    const specDir = makeBuildSpec(VALID_BUILD_SPEC);
    const bs = BuildSpec.fromDirectory(specDir);
    assume(bs.version).to.equal(1);
    assume(bs.docker.repositoryPrefix).to.equal('testing/taskcluster-');
  });

  test('version too new is an error', function() {
    const specDir = makeBuildSpec(VALID_BUILD_SPEC.replace(/version: \d+/, `version: ${VERSION+1}`));
    assume(() => BuildSpec.fromDirectory(specDir)).to.throw(/too new/);
  });
});
