const util = require('util');
const path = require('path');
const assume = require('assume');
const {ClusterSpec} = require('../../src/formats/cluster-spec');

suite('ClusterSpec', function() {
  test('load cluster spec from directory', function() {
    const cs = new ClusterSpec(path.join(__dirname, 'example'));
    assume(cs.build.repositories[0].name).to.equal('ping');
  });
});
