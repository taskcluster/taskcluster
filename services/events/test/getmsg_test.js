suite('Get messages', function() {
  let debug       = require('debug')('test:get_msg');
  let assert      = require('assert');
  let helper = require('./helper');
  let _ = require('lodash');

  // Everything is fine. We should receive pulse messages as usual
  test('Exchange is correct', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-queue/v1/task-completed', routingKey : '#'},
    ]};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('message', (msg) => {
      es.close();
      controls.pass();
    });

    es.addEventListener('error', (err) => {
      es.close();
      assert(false);
      controls.fail(err);
    });

    await controls.resolve;
  });

  // Wrong exchange. Should get 404
  test('Exchange does not exist', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/random/does-not-exist', routingKey : '#'},
    ]};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, '404'));
      assert(_.includes(error, 'no exchange'));
      es.close();
      controls.pass();
    });

    await controls.resolve;
  });

  // Bad routingKey. Should not get any messages.
  test.skip('Arbitrary routingKey', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/taskcluster-queue/v1/task-completed', routingKey : 'abc'},
    ]};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('message', (e) => {
      es.close();
      controls.fail();
    });
    await controls.resolve;
  });
});
