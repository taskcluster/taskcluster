describe('validation', () => {
  beforeAll(() => {
    window.fetch = jest.fn().mockImplementation(() => {
      return {
        json: () => Promise.resolve({}),
      };
    });
  });

  it('should validate actions json', async () => {
    const validateActionsJson = require('./validateActionsJson').default;

    const validateActionsJsonResponse = await validateActionsJson();

    expect(validateActionsJsonResponse).toBeDefined();
    expect(validateActionsJsonResponse({})).toBeTruthy();
  });
});
