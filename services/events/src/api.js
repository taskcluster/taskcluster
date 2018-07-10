let debug = require('debug')('events:api');
let APIBuilder = require('taskcluster-lib-api');
let taskcluster = require('taskcluster-client');
let uuid = require('uuid');
let _ = require('lodash');

let builder = new APIBuilder({
  title: 'AMQP Messages API Documentation',
  description: [
    'This service is responsible for making pulse messages accessible',
    'from browsers and cli. There are API endpoints to',
    'bind / unbind to an exchange and pause / resume listening from a queue',
  ].join('\n'),
  projectName: 'taskcluster-events',
  serviceName: 'events',
  version: 'v1',
  context: ['listeners'],
});

// Returns JSON.parse(bindings) if everything goes well
//   {"bindings" : [ 
//     {"exchange" :  "a/b/c", "routingKeyPattern" : "a.b.c"},
//     {"exchange" :  "x/y/z", "routingKeyPattern" : "x.y.z"},
//   ]};
var parseAndValidateBindings = function(bindings) {
  return new Promise((resolve, reject) => {
    try {
      let json_bindings = JSON.parse(bindings);
      if (String(Object.keys(json_bindings)) !== 'bindings') {
        throw new Error('The json query should have only one key i.e. `bindings`.');
      }  

      // Reduce json_bindings to an array of exchanges.
      json_bindings = json_bindings.bindings;
      if (!Array.isArray(json_bindings)) {
        throw new Error('Bindings must be an array of {exchange, routingKeyPattern}');
      }
      _.forEach(json_bindings, binding => {
        if (!('routingKeyPattern' in binding) || !('exchange' in binding)) {
          throw new Error('Binding must include `exchange` and `routingKeyPattern` fields');
        }
      });
      resolve(json_bindings);
    } catch (e) {
      // A 404 code is required to send the error message without leaking internal information
      reject({code:404, message:e.message});
    }
  });
};

builder.declare({
  method: 'get',
  route: '/connect/',
  query: {
    bindings: /./,
  },
  name: 'connect',
  description: 'Connect to receive messages',
  stability: APIBuilder.stability.experimental,
  // Add input validation yml
  title: 'Events-Api',
}, async function(req, res) {
  debug('hello');

  // If the last event id is '-', send a 204 error blocking all reconnects.
  // No reconnect on 204 is not yet supported on EventSource.
  // Clients using that need to use es.close() to stop error messages.
  if (req.headers['last-event-id']) {
    return res.reportError(204, 'Not allowing reconnects');
  }

  let abort, headWritten, pingEvent;
  const aborted = new Promise((resolve, reject) => abort = reject);

  const sendEvent = (kind, data={}) => {
    try {
      const event = `event: ${kind}\ndata: ${JSON.stringify(data)}\nid: -\n\n`;
      res.write(event);
      debug('..sendEvent', event); 
    } catch (err) {
      debug('Error in sendEvent:');
      abort(err);
    }
  };

  try {

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    headWritten = true;

    let json_bindings = await parseAndValidateBindings(req.query.bindings);
    debug('Bindings parsed');
    var listener = await this.listeners.createListener(json_bindings);
    sendEvent('ready');
    const idleMessage = {code:404, message:'No messages received for 20s. Aborting...'};
    let idleTimeout = setTimeout(() => abort(idleMessage), 20*1000);
    
    listener.on('message', message => {
      sendEvent('message', message);
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => abort(idleMessage), 20*1000);  
    });

    pingEvent = setInterval(() => sendEvent('ping', {
      time: new Date(),
    }), 3 * 1000);

    await Promise.all([
      aborted,
      new Promise((resolve, reject) => req.once('close', reject)),
      new Promise((resolve, reject) => listener.on('error', err => {
        debug('PulseListener Error : '. err);
        reject(err);
      })),
    ]);

  } catch (err) {
    debug('Error : %j', err.message, err.code);
    var errorMessage = 'Unknown Internal Error';
    if (err.code === 404) {
      errorMessage = err.message;
    }

    // Catch errors 
    // bad exchange will be taken care of by i/p validation
    // Send 5xx error code otherwise. Make sure that the head is not written.
    // You can set the response code only once.
    // If head is written, send an error event.
    if (!headWritten) {
      res.reportError(500, 'Something went wrong. Make another request to retry.');
    }

    // TODO : Find a suitable error message depending on err.
    // Most likely these will be PulseListener errors.
    debug('Error message : ', errorMessage);
    sendEvent('error', errorMessage);
  } finally {

    if (pingEvent) {
      debug('unping');
      clearInterval(pingEvent);
    }
    // Close the listener
    this.listeners.closeListener(listener);

    if (!res.finished) {
      debug('Ending response');
      res.end();
    }
  }

});

// Export api
module.exports = builder;
    