suite('Failed Input Validation', function() {
  let debug       = require('debug')('test:bad_input');
  let assert      = require('assert');
  let helper = require('./helper');
  let _ = require('lodash');

  // Wrong exchange. Should get 404
  test('More than one key in query', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/random/does-not-exist', routingKey : '#'},
    ], foo: 'bar'};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, 'The json query should have only one key'));
      es.close();
      controls.pass();
    });
    await controls.resolve;
  });

  test('Bindings is not an array', async () => {
    let bindings = {bindings : {exchange :  'exchange/random/does-not-exist', routingKey : '#'}};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, 'Bindings must be an array of {exchange, routingKey}'));
      es.close();
      controls.pass();
    });
    await controls.resolve;
  });

  test.skip('A binding has more than 2 fields', async () => {
    let bindings = {bindings : [ 
      {exchange :  'exchange/random/does-not-exist', routingKey : '#', foo : 'bar'},
    ]};

    let controls = helper.connect(bindings);
    //controls = {es, resolve, pass, fail}
    let es = controls.es;

    es.addEventListener('error', (e) => {
      error = e.data;
      assert(_.includes(error, 'Each binding must have only two fields - exchange and routingKey'));
      es.close();
      controls.pass();
    });
    await controls.resolve;
  });

});
