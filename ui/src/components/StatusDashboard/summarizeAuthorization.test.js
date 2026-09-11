import summarizeAuthorization from './summarizeAuthorization';

describe('summarizeAuthorization', () => {
  it('should return empty values', () => {
    const out = summarizeAuthorization({}, {}, {});

    expect(out.length).toEqual(4);
    expect(out[0].value).toEqual('0');
    expect(out[0].error).toBeUndefined();
    expect(out[0].link).toEqual('/auth/clients');
    expect(out[1].link).toEqual('/auth/clients');
    expect(out[2].link).toEqual('/auth/roles');
    expect(out[3].link).toEqual('/secrets');
  });
  it('should include errors', () => {
    const out = summarizeAuthorization(
      {
        error: new Error('wrong'),
      },
      {},
      {}
    );

    expect(out.length).toEqual(4);
    expect(out[0].value).toEqual('0');
    expect(out[0].error).toEqual('wrong');
    expect(out[1].error).toEqual('wrong');
    expect(out[2].error).toBeUndefined();
  });
  it('should return counts', () => {
    const out = summarizeAuthorization(
      {
        data: [
          { clientId: 'old', lastDateUsed: new Date('2000-01-01') },
          { clientId: 'recent', lastDateUsed: new Date() },
        ],
      },
      { data: ['role1', 'role2'] },
      { data: ['s1', 's2'] }
    );

    expect(out.length).toEqual(4);
    expect(out[0].value).toEqual('2');
    expect(out[1].value).toEqual('1');
    expect(out[2].value).toEqual('2');
    expect(out[3].value).toEqual('2');
  });
});
