'use strict';

var base = require('taskcluster-base');
var assert = require('assert');
var debug = require('debug')('mock-server-for-python');

var port = Number(process.env.PORT);
if (!port || typeof(port) !== 'number') {
  console.error('You must specify a port number');
  process.exit(-1);
}

var clients = [
  {
    clientId: 'admin',
    accessToken: 'adminToken',
    expires: new Date(3000, 0, 0),
    scopes: ['*'],
  },
  {
    clientId: 'expired',
    accessToken: 'expiredToken',
    expires: new Date(1999, 0, 0),
    scopes: ['*'],
  },
  {
    clientId: 'goodScope',
    accessToken: 'goodScopeToken',
    expires: new Date(3000, 0, 0),
    scopes: ['auth:credentials'],
  },
  {
    clientId: 'badScope',
    accessToken: 'badScopeToken',
    expires: new Date(3000, 0, 0),
    scopes: ['not-a-scope'],
  },
];

console.log('Starting mock server on port %d with clients:\n', port);
console.log(JSON.stringify(clients, null, 2));

var _server
base.testing.createMockAuthServer({
	port: port,
	clients: clients
}).then(function(server) {
  debug('Started server');
	_server = server;
});

function bail() {
  debug('Stopping server');
	_server.terminate().then(function() {
		process.exit(0);
	}, function(err) {
    console.error(err, 'Error stopping server, exiting uncleanly');
		process.exit(-1);	
	});
}

process.on('SIGTERM', bail);
process.on('SIGINT', bail);

