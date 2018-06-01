const fs = require('fs');
const assert = require('assert');
const build = require('../src/build');
const mockFs = require('mock-fs');

suite('building output', function() {
  setup(function() {
    mockFs({
      '/test/input': {
      },
    });
  });
  teardown(function() {
    mockFs.restore();
  });

  test('deletes and re-creates output', async function() {
    mockFs({
      '/test/output/junk': 'junk-data',
    });
    assert(fs.existsSync('/test/output/junk'));
    await build('/test/input', '/test/output', 'https://tc-tests.localhost');
    assert(fs.existsSync('/test/output'));
    assert(!fs.existsSync('/test/output/junk'));
  });
});
