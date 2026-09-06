import fetchAllPages from './fetchAllPages';

describe('fetchAllPages', () => {
  it('returns the items of a single page', async () => {
    const request = vi.fn().mockResolvedValue({ things: ['a', 'b'] });

    const items = await fetchAllPages(request, r => r.things, { limit: 10 });

    expect(items).toEqual(['a', 'b']);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ limit: 10 });
  });

  it('follows continuation tokens until exhausted', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ things: ['a'], continuationToken: 't1' })
      .mockResolvedValueOnce({ things: ['b', 'c'], continuationToken: 't2' })
      .mockResolvedValueOnce({ things: ['d'] });

    const items = await fetchAllPages(request, r => r.things, { limit: 1 });

    expect(items).toEqual(['a', 'b', 'c', 'd']);
    expect(request.mock.calls).toEqual([
      [{ limit: 1 }],
      [{ limit: 1, continuationToken: 't1' }],
      [{ limit: 1, continuationToken: 't2' }],
    ]);
  });

  it('passes no options when none are given', async () => {
    const request = vi.fn().mockResolvedValue({ things: [] });

    const items = await fetchAllPages(request, r => r.things);

    expect(items).toEqual([]);
    expect(request).toHaveBeenCalledWith({});
  });

  it('propagates request errors', async () => {
    const request = vi.fn().mockRejectedValue(new Error('nope'));

    await expect(fetchAllPages(request, r => r.things)).rejects.toThrow('nope');
  });
});
