describe('validation', () => {
  beforeAll(() => {
    window.fetch = vi.fn().mockImplementation(url => {
      return {
        json: () =>
          Promise.resolve({
            $id: url,
          }),
      };
    });
  });

  it('should validate payload json', async () => {
    const validate = require('./validateTaskPayloadSchemas').default; // eslint-disable-line global-require

    const errors = await validate('');

    expect(errors).toBeDefined();
    expect(errors).toEqual([]);
    expect(window.fetch).toHaveBeenCalled();
  });

  it('should format messages', () => {
    const { formatErrorDetails } = require('./validateTaskPayloadSchemas'); // eslint-disable-line global-require

    expect(
      formatErrorDetails({
        message: 'Invalid',
      })
    ).toEqual('Invalid');
    expect(
      formatErrorDetails({
        message: 'Invalid',
        keyword: 'type',
        instancePath: '/cmd/0',
      })
    ).toEqual("Invalid '/cmd/0'");
    expect(
      formatErrorDetails({
        message: 'Invalid',
        keyword: 'additionalProperties',
        params: {
          additionalProperty: 'extra',
        },
      })
    ).toEqual("Invalid 'extra'");
  });
});
