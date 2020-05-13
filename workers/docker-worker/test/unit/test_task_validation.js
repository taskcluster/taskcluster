const assert = require('assert');
const SchemaSet = require('../../src/lib/validate');
const _ = require('lodash');
const libUrls = require('taskcluster-lib-urls');

suite('Task validation', async function() {
  const payloadSchema = libUrls.schema(libUrls.testRootUrl(), 'docker-worker', 'v1/payload.json#');
  before(async function() {
    const schemaset = new SchemaSet({
      serviceName: 'docker-worker',
      publish: false,
    });
    this.validator = await schemaset.validator(libUrls.testRootUrl());
  });

  test('accept valid schema', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu',
      command: ['echo', '5'],
      maxRunTime: 5 * 60
    };

    let errors = this.validator(payload, payloadSchema);
    assert(errors === null, `Valid payload considered invalid. ${JSON.stringify(errors)}`);
  });

  test('catch invalid schema', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu'
      // No maxRunTime is an invalid schema.
    };

    let errors = this.validator(payload, payloadSchema);
    assert(!_.isEmpty(errors), `Invalid payload considered valid. ${JSON.stringify(errors)}`);
  });

  test('accept missing command', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu',
      // No command provided should be ok.
      maxRunTime: 5 * 60
    };

    let errors = this.validator(payload, payloadSchema);
    assert(errors === null, `Valid payload considered invalid. ${JSON.stringify(errors)}`);
  });

  test('accept docker image as an object', async function () {
    let payload = {
      image: {
        type: 'docker-image',
        name: 'ubuntu:14.04'
      },
      maxRunTime: 60
    };

    let errors = this.validator(payload, payloadSchema);
    assert(errors === null, `Valid payload considered invalid. ${JSON.stringify(errors)}`);
  });

  test('accept docker image as a string', async function () {
    let payload = {
      image: 'ubuntu:14.04',
      maxRunTime: 60
    };

    let errors = this.validator(payload, payloadSchema);
    assert(errors === null, `Valid payload considered invalid. ${JSON.stringify(errors)}`);
  });

  test('catch image as an object with invalid type', async function () {
    let payload = {
      image: {
        type: 'dockerimage',
        name: 'ubuntu:14.04'
      },
      maxRunTime: 60
    };

    let errors = this.validator(payload, payloadSchema);
    assert(!_.isEmpty(errors), `Invalid payload considered valid. ${JSON.stringify(errors)}`);
  });

  test('accept indexed image', async function () {
    let payload = {
      image: {
        type: 'indexed-image',
        namespace: 'public.test.images.ubuntu.14_04',
        path: 'public/image.tar'
      },
      maxRunTime: 60
    };

    let errors = this.validator(payload, payloadSchema);
    assert(errors === null, `Valid payload considered invalid. ${JSON.stringify(errors)}`);
  });

  test('catch indexed image missing path', async function () {
    let payload = {
      image: {
        type: 'indexed-image',
        namespace: 'public.test.images.ubuntu.14_04'
      },
      maxRunTime: 60
    };

    let errors = this.validator(payload, payloadSchema);
    assert(!_.isEmpty(errors), `Invalid payload considered valid. ${JSON.stringify(errors)}`);
  });
});
