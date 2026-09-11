import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import { validateTriggerPayload } from '../src/trigger-schema.js';

suite(testing.suiteName(), () => {
  const triggerSchema = {
    type: 'object',
    properties: {
      action: {
        enum: ['opened'],
      },
    },
    required: ['action'],
    additionalProperties: true,
  };

  test('accepts payloads matching triggerSchema', () => {
    assert.equal(validateTriggerPayload(triggerSchema, { action: 'opened' }), null);
  });

  test('returns an error for payloads failing triggerSchema', () => {
    assert.match(validateTriggerPayload(triggerSchema, { action: 'closed' }), /data\/action/);
  });
});
