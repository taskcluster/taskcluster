/**
Stub for the aws metadata server.
*/

var app = require('koa')();
var PREFIX = '/latest';

function route(path) {
  if (path.indexOf(PREFIX) === 0) {
    path = path.slice(PREFIX.length)
  }

  switch (path) {
    case '/meta-data/public-hostname':
      return 'publichost';
    case '/user-data':
      return new Buffer(JSON.stringify({ capacity: 1 }));
    case '/meta-data/ami-id':
      return 'ami-333333';
    case '/meta-data/instance-type':
      return 'c3.xlarge';
    case '/meta-data/placement/availability-zone':
      return 'us-west-2';
    case '/meta-data/instance-id':
      return 'i-123456';
    default:
      throw new Error('unknown path: ' + path);
  }
}

app.use(function* () {
  var url = route(this.url);
  this.body = url;
});

module.exports = app;
