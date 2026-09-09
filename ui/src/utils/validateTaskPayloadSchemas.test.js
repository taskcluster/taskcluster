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
    const { default: validate } = await import('./validateTaskPayloadSchemas');

    const errors = await validate('');

    expect(errors).toBeDefined();
    expect(errors).toEqual([]);
    expect(window.fetch).toHaveBeenCalled();
  });

  it('should format messages', async () => {
    const { formatErrorDetails } = await import('./validateTaskPayloadSchemas');

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
