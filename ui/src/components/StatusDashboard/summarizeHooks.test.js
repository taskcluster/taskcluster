import summarizeHooks from './summarizeHooks';

describe('summarizeHooks', () => {
  it('should return empty values', () => {
    const out = summarizeHooks({});

    expect(out.length).toEqual(2);
    expect(out[0].value).toEqual('0');
    expect(out[0].error).toBeUndefined();
    expect(out[0].link).toEqual('/hooks');
    expect(out[1].value).toEqual('0');
  });
  it('should include errors', () => {
    const out = summarizeHooks({
      error: new Error('wrong'),
    });

    expect(out.length).toEqual(2);
    expect(out[0].value).toEqual('0');
    expect(out[1].error).toEqual('wrong');
    expect(out[0].link).toEqual('/hooks');
  });
  it('should return counts', () => {
    const out = summarizeHooks({
      data: {
        hookGroups: [{ hooks: ['one'] }, { hooks: ['two', 'three'] }],
      },
    });

    expect(out.length).toEqual(2);
    expect(out[0].value).toEqual('2');
    expect(out[1].value).toEqual('3');
  });
});
