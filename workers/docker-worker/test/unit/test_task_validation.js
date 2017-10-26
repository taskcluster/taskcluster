const assert = require('assert');
const base = require('taskcluster-base');
const path = require('path');
const _ = require('lodash');

const { PAYLOAD_SCHEMA } = require('../../src/lib/task.js');

suite('Task validation', async function() {
  before(async function() {
    this.validator = await base.validator({
      prefix: 'docker-worker/v1/'
    });
  });

  test('accept valid schema', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu',
      command: ['echo', '5'],
      maxRunTime: 5 * 60
    };

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
    assert(errors === null, `Valid payload considered invalid. ${JSON.stringify(errors)}`);
  });

  test('catch invalid schema', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu'
      // No maxRunTime is an invalid schema.
    };

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
    assert(!_.isEmpty(errors), `Invalid payload considered valid. ${JSON.stringify(errors)}`);
  });

  test('accept missing command', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu',
      // No command provided should be ok.
      maxRunTime: 5 * 60
    };

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
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

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
    assert(errors === null, `Valid payload considered invalid. ${JSON.stringify(errors)}`);
  });

  test('accept docker image as a string', async function () {
    let payload = {
      image: 'ubuntu:14.04',
      maxRunTime: 60
    };

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
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

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
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

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
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

    let errors = this.validator(payload, PAYLOAD_SCHEMA);
    assert(!_.isEmpty(errors), `Invalid payload considered valid. ${JSON.stringify(errors)}`);
  });
});
