describe('ajv', () => {
  it('should validate', () => {
    const ajv = require('./ajv').default; // eslint-disable-line global-require

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

  describe('loadServiceSchema', () => {
    beforeAll(() => {
      window.fetch = vi.fn().mockImplementation(url => {
        return {
          json: () =>
            Promise.resolve({
              $id: new URL(url).pathname,
            }),
        };
      });
    });

    it('should add schema once', async () => {
      const ajv = require('./ajv').default; // eslint-disable-line global-require

      await ajv.loadServiceSchema('svc', 'schema1');
      expect(ajv.getSchema('/schemas/svc/schema1')).toBeDefined();
      ajv.loadServiceSchema('svc', 'schema1');
      ajv.loadServiceSchema('svc', 'schema1');
      expect(window.fetch).toHaveBeenCalledTimes(1);

      await ajv.loadServiceSchema('svc2', 'schema2', 'alias');
      expect(ajv.getSchema('/schemas/svc2/schema2')).toBeDefined();
      expect(ajv.getSchema('alias')).toBeDefined();
      ajv.loadServiceSchema('svc2', 'schema2');
      ajv.loadServiceSchema('svc2', 'schema2');
      expect(window.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
