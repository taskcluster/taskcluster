# Taskcluster AMQP Events Proxy

This proxy allows web-based applications to consume Pulse messages, such as those produced by other Taskcluster services.

## Usage

We use [Server-Sent Events](https://www.w3.org/TR/2009/WD-eventsource-20090421/). The client has to use an EventSource interface to connect to the api and listen for events. The bindings (`exchange` and `routingKeyPattern`) have to be provided as query parameters. 

```js
const EventSource = require('eventsource'); // Not required in browser-clients
const urlencode   = require('urlencode'); // Not required in browser-clients

const bindings = {bindings : [ 
  {exchange :  'exchange/foo/bar', routingKeyPattern : 'a.b.c'},
  ...
]};
const jsonBindings = urlencode(JSON.stringify(bindings);

const listener = new EventSource(`${TASKCLUSTER_ROOT_URL}/events/v1/connect/?bindings=${jsonBindings}`)
```
The browser exposes an instance of `EventSource` so there is no need to `require` it. Similar client implementations are available in most common languages

## Events

We have 4 types of events - 
* __ping__  : sent every 20 seconds to make sure the connection is open.
* __ready__ : sent after the binding is complete. Now you can expect pulse messages.
* __message__ : sent when a pulse message arrives. Note that the actual message is in `message.data`.
* __error__ : sent in case of errors like bad input.

```js
// Listen for an event type 
listener.addEventListener('message', msg => {
    const message = JSON.parse(msg.data);
    // Do something with message
});

//Close the listener
listener.close();
```
The connection is closed by the server if the `bindings` is not in the correct format.
The `eventsource` in that case automatically [tries to reconnect](https://www.w3.org/TR/2009/WD-eventsource-20090421/#reset-the-connection), without correcting the errors, which is rejected by the server. Thus it makes sense to disable these reconnects altogether.

This is done by setting the `id` of each event to `-` and returning `204 : No input` when `Last-Event-Id : -` is sent in the request headers.The client can however, force it by closing and restarting the listener.


## Testing

Install npm dependencies using `yarn` and run `yarn test` to run the tests. 
To build it locally you need to use `NODE_ENV='test' TASKCLUSTER_ROOT_URL='localhost:12345' node src/main.js server` 
This will use the pulse credentials in the test profile of `user-config.yml` (see user-config-example.yml). Set `pulse.vhost: /` in user-config.yml when using with`pulse.hostname: pulse.mozilla.org`.
Set `DEBUG=events:*` for additional debugging information.



