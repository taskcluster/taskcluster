const {dbSuite} = require('./helper');
const {Schema} = require('..');
const path = require('path');

suite(path.basename(__filename), function() {
  suite('constructor', function() {
    test('configure single version', function() {
      const sch = new Schema({
        serviceName: 'taskcluster-lib-postgres',
        script: 'create table',
      });
    });

    test('configure multiple versions', function() {
      const sch = new Schema({
        serviceName: 'taskcluster-lib-postgres',
        script: 'create table',
      }).addVersion(2, 'alter table');
    });

    // TODO: more
  });
});
