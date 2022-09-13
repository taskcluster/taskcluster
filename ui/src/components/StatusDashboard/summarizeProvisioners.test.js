import summarizeProvisioners from './summarizeProvisioners';

describe('summarizeProvisioners', () => {
  it('should return empty values', () => {
    const out = summarizeProvisioners({});

    expect(out.length).toEqual(1);
    expect(out[0].value).toEqual('0');
    expect(out[0].error).toBeUndefined();
    expect(out[0].link).toEqual('/provisioners');
  });
  it('should include errors', () => {
    const out = summarizeProvisioners({
      error: new Error('wrong'),
    });

    expect(out.length).toEqual(1);
    expect(out[0].value).toEqual('0');
    expect(out[0].error).toEqual('wrong');
  });
  it('should return counts', () => {
    const out = summarizeProvisioners({
      data: {
        provisioners: {
          edges: ['one', 'two'],
        },
      },
    });

    expect(out.length).toEqual(1);
    expect(out[0].value).toEqual('2');
  });
});
