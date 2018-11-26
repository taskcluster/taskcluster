const path = require('path');
const {build} = require('../src/main');
const tmp = require('tmp');

suite('integration_test.js', function() {
  // the built-services directory is created with:
  // ( cd $BASEDIR/docs && tar -zvcf - */{schemas,references,metadata.json}; ) | tar -C test/built-services -zxf -
  // where $BASEDIR is the basedir of a tc-builder run
  const input = path.join(__dirname, 'built-services');

  setup('create output directory', function() {
    this.tmpdir = tmp.dirSync({unsafeCleanup: true});
  });

  teardown('remove output directory', function() {
    this.tmpdir.removeCallback();
  });

  test('reads and translates a snapshot of the built-services format, for regular rootUrl', function() {
    const output = path.join(this.tmpdir.name, 'output');
    try {
      build(input, output, 'https://tc.example.com');
    } catch (err) {
      if (err.problems) {
        throw new Error(err.problems.join('\n'));
      } else {
        throw err;
      }
    }
  });
});
