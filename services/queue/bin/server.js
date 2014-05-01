var debug = require('debug')('queue:server');
var program = require('commander');
var express = require('express');
var path = require('path');

var Promise = require('promise');
var AWS = require('aws-sdk-promise');
var Bucket = require('../queue/bucket');
var TasksStore = require('../queue/tasks_store');

function launch(options) {
  var nconf = require(__dirname + '/../config/' + program.config)();

  require('../utils/spread-promise').patch();

  var app = exports.app = express();
  app.set('port', Number(process.env.PORT || nconf.get('server:port')));
  app.set('nconf', nconf);

  // task bucket
  var s3 = new AWS.S3(nconf.get('aws'));

  app.set(
    'bucket',
    new Bucket(
      s3,
      nconf.get('queue:taskBucket'), // bucket location
      nconf.get('queue:taskBucketIsCNAME') ?
        nconf.get('queue:taskBucket') :
        null
    )
  );

  // task database store
  var knex = require('knex').initialize({
    client: 'postgres',
    connection: nconf.get('database:connectionString')
  });

  app.set('db', TasksStore(knex));

  // routes
  require('../routes/api/v1').mount(app, '/v1');

  app.use(express.json());
  app.use(app.router);

  // Middleware for development
  if ('development' == app.get('env')) {
    app.use(express.errorHandler());
  }
  // validate
  require('../utils/validate').setup();

  // async setup stuff...
  var eventsSetup = require('../queue/events').connect(nconf.get('amqp:url'));

  var publishSchema = nconf.get('queue:publishSchema') ?
    require('./utils/render-schema').publish() :
    null;

  var schemaSetup = require('../queue/schema').create(knex);

  Promise.all([eventsSetup, publishSchema, schemaSetup]).
    then(function(setup) {
      // XXX: This looks ugly because we are mixing concerns here...
      //      The events setup step should be its own channel with only the
      //      exchange setup and then separately we can lazily connect to amqp
      //      to send messages.
      app.set('events', setup[0]);

      // reaper to clean database every once and awhile
      var reaper = require('../queue/reaper')(
        nconf.get('queue:reaperInterval'),
        app.get('db'),
        app.get('events')
      );

      reaper.start();
      app.set('reaper', reaper);

      var server = require('http').createServer(app);
      var listen = Promise.denodeify(server.listen.bind(server, app.get('port')));
      return listen();
    }).
    then(function() {
      debug('Express server listening on port ' + app.get('port'));
      if (process.send) {
        process.send({ready: true});
      }
    }).
    catch(function(err) {
      debug("Failed to start server, err: %s, as JSON: %j", err, err, err.stack);
      // If we didn't launch the server we should crash
      process.exit(1);
    });
}

program.
  command('server').
  description('launch the queue server').
  action(launch);
