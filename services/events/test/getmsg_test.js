const debug     = require('debug')('test:get_msg');
const assert    = require('assert');
const helper    = require('./helper');
const _         = require('lodash');

helper.secrets.mockSuite(__filename, [], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  test('Exchange is correct', async () => {
    const bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-foo/v1/bar', routingKeyPattern : '#'},
    ]};

    const {evtSource, resolve, pass, fail} = helper.connect(bindings);
    
    evtSource.addEventListener('ready', msg => {
      const message = {
        exchange: 'exchange/taskcluster-foo/v1/bar',
        routingKey: 'some.route',
        routes: ['some.other.routes'],
        payload: {
          status: 'fooIsBar',
        },
      };
      _.last(helper.listeners).fakeMessage(message);
    });

    evtSource.addEventListener('message', (msg) => {
      assert(JSON.parse(msg.data).payload.status === 'fooIsBar');
      evtSource.close();
      pass();
    });

    evtSource.addEventListener('error', (err) => {
      evtSource.close();
      assert(false);
      fail(err);
    });

    await resolve;
  });
});
