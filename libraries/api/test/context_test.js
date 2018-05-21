const validator       = require('taskcluster-lib-validate');
const App             = require('taskcluster-lib-app');
const APIBuilder      = require('../');
const assert          = require('assert');
const request         = require('superagent');
const slugid          = require('slugid');
const path            = require('path');

suite('API (context)', function() {
  const rootUrl = 'http://localhost:4321';
  test('Provides context', async () => {
    // Create test api
    var builder = new APIBuilder({
      title:        'Test Api',
      description:  'Another test api',
      context:      ['myProp'],
      serviceName:  'test',
      version:      'v1',
    });

    builder.declare({
      method:   'get',
      route:    '/context/',
      name:     'getContext',
      title:    'Test End-Point',
      description:  'Place we can call to test something',
    }, function(req, res) {
      res.status(200).json({myProp: this.myProp});
    });

    var value = slugid.v4();
    let validate = await validator({
      rootUrl,
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    const api = await builder.build({
      rootUrl,
      validator: validate,
      context: {
        myProp: value,
      },
    });

    let server = await App({
      port:       60872,
      env:        'development',
      forceSSL:   false,
      trustProxy: false,
      apis: [api],
    });

    await request
      .get('http://localhost:60872/api/test/v1/context')
      .then(function(res) {
        assert(res.body.myProp === value);
      }).then(function() {
        return server.terminate();
      }, function(err) {
        return server.terminate().then(function() {
          throw err;
        });
      });
  });

  test('Context properties can be required', async () => {
    // Create test api
    var builder = new APIBuilder({
      title:        'Test Api',
      description:  'Another test api',
      context:      ['prop1', 'prop2'],
      serviceName:  'test',
      version:      'v1',
    });

    var value = slugid.v4();
    let validate = await validator({
      rootUrl,
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    try {
      await builder.build({
        rootUrl,
        validator:  validate,
        context: {
          prop1: 'value1',
        },
      });
    } catch (err) {
      if (/Context must have declared property: 'prop2'/.test(err)) {
        return; //expected error
      }
      throw err;
    }
    assert(false, 'Expected an error!');
  });

  test('Context properties can provided', async () => {
    // Create test api
    var builder = new APIBuilder({
      title:        'Test Api',
      description:  'Another test api',
      context:      ['prop1', 'prop2'],
      serviceName:  'test',
      version:      'v1',
    });

    var value = slugid.v4();
    let validate = await validator({
      rootUrl,
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    await builder.build({
      rootUrl,
      validator:  validate,
      context: {
        prop1: 'value1',
        prop2: 'value2',
      },
    });
  });

  test('Context entry should be known', async () => {
    //Create test api
    var builder = new APIBuilder({
      title:        'Test Api',
      description:  'Another test api',
      context:      [],
      serviceName:  'test',
      version:      'v1',
    });

    var value = slugid.v4();
    let validate = await validator({
      rootUrl,
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    try {
      await builder.build({
        rootUrl,
        validator: validate,
        context: {
          prop3: 'value3',
        },
      });
    } catch (err) {
      if (/Context has unexpected property: prop3/.test(err)) {
        return; //expected error
      }
      throw err;
    }
    assert(false, 'Expected an error!');
  });
});
