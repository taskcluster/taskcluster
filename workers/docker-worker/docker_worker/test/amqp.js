var Schema = require('amqpworkers/schema');
var TaskSchema = new Schema({
  exchanges: [],
  binds: [],
  queues: [
    ['tasks', { durable: false }]
  ]
});

var amqplib = require('amqplib');

function amqp() {
  var result = {};

  setup(function() {
    return amqplib.connect(process.env.RABBITMQ_PORT).then(
      function connected(con) {
        result.connection = con;
        return TaskSchema.define(con);
      }
    ).then(
      function() {
        return TaskSchema.purge(result.connection);
      }
    );
  });

  teardown(function() {
    return TaskSchema.destroy(result.connection);
  });

  return result;
}

module.exports = amqp;
