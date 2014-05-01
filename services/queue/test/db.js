var knex = require('knex');
var schema = require('../queue/schema');
var config = require('../config/test')();

module.exports = function connect() {
  var db = knex.initialize({
    client: 'postgres',
    connection: config.get('database:connectionString')
  });

  // ensure we have a clean working state in the database.
  var create = schema.create.bind(schema, db);
  return schema.destroy(db).then(create).then(function() {
    return db;
  });
};
