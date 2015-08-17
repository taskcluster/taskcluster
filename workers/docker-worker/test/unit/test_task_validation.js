import assert from 'assert';
import _ from 'lodash';

import base from 'taskcluster-base';
import { PAYLOAD_SCHEMA } from '../../lib/task.js';

suite('Task validation', async function() {
  before(async function() {
    this.validator = await base.validator();
    this.validator.register(require('../../schemas/payload'));
  });

  test('accept valid schema', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu',
      command: ["echo", "5"],
      maxRunTime: 5 * 60
    };

    let errors = this.validator.check(payload, PAYLOAD_SCHEMA);
    assert(errors === null, 'Valid payload considered invalid.');
  });

  test('catch invalid schema', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu',
      // No maxRunTime is an invalid schema.
    };

    let errors = this.validator.check(payload, PAYLOAD_SCHEMA);
    assert(!_.isEmpty(errors), 'Invalid payload considered valid.');
  });

  test('accept missing command', async function () {
    let payload = {
      image: 'taskcluster/test-ubuntu',
      // No command provided should be ok.
      maxRunTime: 5 * 60
    };

    let errors = this.validator.check(payload, PAYLOAD_SCHEMA);
    assert(errors === null, 'Valid payload considered invalid.');
  });
});
