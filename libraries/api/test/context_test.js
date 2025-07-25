import SchemaSet from '@taskcluster/lib-validate';
import { App } from '@taskcluster/lib-app';
import { APIBuilder } from '../src/index.js';
import assert from 'assert';
import request from 'superagent';
import slugid from 'slugid';
import sinon from 'sinon';
import path from 'path';
import { monitor } from './helper.js';
import testing from '@taskcluster/lib-testing';

const __dirname = new URL('.', import.meta.url).pathname;

suite(testing.suiteName(), function() {
  const rootUrl = 'http://localhost:4321';

  setup(async () => {
    testing.fakeauth.start({
      'client-with-aa-bb-dd': ['aa', 'bb', 'dd'],
    }, { rootUrl });
  });
  teardown(() => {
    testing.fakeauth.stop();
  });

  test('Provides context', async () => {
    // Create test api
    const builder = new APIBuilder({
      title: 'Test Api',
      description: 'Another test api',
      context: ['myProp'],
      serviceName: 'test',
      apiVersion: 'v1',
    });
    builder.declare({
      method: 'get',
      route: '/context/',
      name: 'getContext',
      scopes: null,
      title: 'Test End-Point',
      category: 'API Library',
      description: 'Place we can call to test something',
    }, function(req, res) {
      res.status(200).json({ myProp: this.myProp });
    });

    const value = slugid.v4();
    const schemaset = new SchemaSet({
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    const api = await builder.build({
      rootUrl,
      monitor,
      schemaset,
      context: {
        myProp: value,
      },
    });

    const server = await App({
      port: 60872,
      env: 'development',
      forceSSL: false,
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
    const builder = new APIBuilder({
      title: 'Test Api',
      description: 'Another test api',
      context: ['prop1', 'prop2'],
      serviceName: 'test',
      apiVersion: 'v1',
    });

    const schemaset = new SchemaSet({
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    try {
      await builder.build({
        rootUrl,
        monitor,
        schemaset,
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
    const builder = new APIBuilder({
      title: 'Test Api',
      description: 'Another test api',
      context: ['prop1', 'prop2'],
      serviceName: 'test',
      apiVersion: 'v1',
    });

    const schemaset = new SchemaSet({
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    await builder.build({
      rootUrl,
      monitor,
      schemaset,
      context: {
        prop1: 'value1',
        prop2: 'value2',
      },
    });
  });

  test('Context entry should be known', async () => {
    //Create test api
    const builder = new APIBuilder({
      title: 'Test Api',
      description: 'Another test api',
      context: [],
      serviceName: 'test',
      apiVersion: 'v1',
    });

    const schemaset = new SchemaSet({
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });
    try {
      await builder.build({
        rootUrl,
        monitor,
        schemaset,
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

  test('Context entries that take per-request data are updated', async () => {
    const builder = new APIBuilder({
      title: 'Test Api',
      description: 'Another test api',
      context: ['foo'],
      serviceName: 'test',
      apiVersion: 'v1',
    });

    const schemaset = new SchemaSet({
      serviceName: 'test',
      folder: path.join(__dirname, 'schemas'),
    });

    builder.declare({
      method: 'get',
      route: '/context/',
      name: 'getContext',
      scopes: null,
      title: 'Test End-Point',
      category: 'API Library',
      description: 'Place we can call to test something',
    }, function(req, res) {
      res.status(200).json(this.foo());
    });

    let fooFake = undefined;
    const api = await builder.build({
      rootUrl,
      monitor,
      schemaset,
      context: {
        foo: {
          taskclusterPerRequestInstance: ({ traceId, requestId }) => {
            fooFake = sinon.fake.returns({ foo: traceId, bar: requestId });
            return fooFake;
          },
        },
      },
    });
    // See that it is lazily loaded so it is not instantiated yet
    assert.equal(fooFake, undefined);

    const server = await App({
      port: 60872,
      env: 'development',
      forceSSL: false,
      trustProxy: false,
      apis: [api],
    });

    await request
      .get('http://localhost:60872/api/test/v1/context')
      .set('x-taskcluster-trace-id', 'foo/bar')
      .then(function(res) {
        assert.equal(res.body.foo, 'foo/bar');
        assert(res.body.bar);
      }).then(function() {
        return server.terminate();
      }, function(err) {
        return server.terminate().then(function() {
          throw err;
        });
      });

    assert.equal(fooFake.callCount, 1);
  });
});
