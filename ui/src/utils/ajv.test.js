import ajv from './ajv';

describe('ajv', () => {
  it('should validate', () => {
    const schema = {
      type: 'object',
      properties: {
        a: {
          type: 'string',
        },
      },
    };
    const data = {
      a: 'hello',
    };

    expect(ajv.validate(schema, data)).toBe(true);
  });
});
