import validateActionsJson from './validateActionsJson';

describe('validation', () => {
  beforeAll(() => {
    window.fetch = vi.fn().mockImplementation(() => {
      return {
        json: () => Promise.resolve({}),
      };
    });
  });

  it('should validate actions json', async () => {
    const validateActionsJsonResponse = await validateActionsJson();

    expect(validateActionsJsonResponse).toBeDefined();
    expect(validateActionsJsonResponse({})).toBeTruthy();
  });
});
