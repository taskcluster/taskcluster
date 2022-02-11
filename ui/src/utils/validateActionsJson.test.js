describe('validation', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = window.env;
    window.env = {
      TASKCLUSTER_ROOT_URL: 'https://taskcluster.net',
    };
    window.fetch = jest.fn().mockImplementation(() => {
      return {
        json: () => Promise.resolve({}),
      };
    });
  });
  afterAll(() => {
    window.env = originalEnv;
  });

  it('should validate actions json', async () => {
    const validateActionsJson = require('./validateActionsJson').default; // eslint-disable-line global-require

    const validateActionsJsonResponse = await validateActionsJson();

    expect(validateActionsJsonResponse).toBeDefined();
    expect(validateActionsJsonResponse({})).toBeTruthy();
  });
});
