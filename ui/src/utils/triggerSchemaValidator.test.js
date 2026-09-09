import buildTriggerSchemaValidator from './triggerSchemaValidator';

describe('triggerSchemaValidator resilience', () => {
  it('surfaces a schema-error state for a malformed schema without throwing', () => {
    const { validate, schemaError } = buildTriggerSchemaValidator({
      type: 'not-a-real-type',
    });

    expect(validate).toBeNull();
    expect(schemaError).toEqual(expect.any(String));
    expect(schemaError.length).toBeGreaterThan(0);
  });

  it('treats an empty schema {} as valid (accepts every payload), not an error', () => {
    const { validate, schemaError } = buildTriggerSchemaValidator({});

    expect(schemaError).toBeNull();
    expect(validate({ anything: 'goes' })).toBeNull();
  });
});
