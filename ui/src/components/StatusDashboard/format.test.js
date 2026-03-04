import format from './format';

describe('format', () => {
  it('should format number', () => {
    expect(format(5)).toEqual('5');
    expect(format(123456)).toEqual('123,456');
    expect(format(123456789)).toEqual('123,456,789');
    expect(format(123.33)).toEqual('123.33');
    expect(format('')).toEqual('0');
    expect(format('-1')).toEqual('-1');
    expect(format('0')).toEqual('0');
  });
});
