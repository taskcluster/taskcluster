describe('exchangesList', () => {
  beforeAll(() => {
    window.fetch = jest.fn().mockImplementation(url => {
      return {
        json: () =>
          Promise.resolve({
            $id: url,
            exchangePrefix: url.replace('.json', '/').substr(1),
            entries: [
              {
                exchange: 'exchange1',
              },
            ],
          }),
      };
    });
  });

  it('should return list of entries', async () => {
    const fetchList = require('./exchangesList').default; // eslint-disable-line global-require

    const exchanges = await fetchList();

    expect(exchanges).toBeDefined();
    expect(
      exchanges.includes('references/auth/v1/exchanges/exchange1')
    ).toBeTruthy();
    expect(window.fetch).toHaveBeenCalled();
  });
});
