import parseTime from './parseTime';

describe('parseTime', () => {
  it('should parse year', () => {
    expect(parseTime('1 yr').years).toEqual(1);
    expect(parseTime('1 year').years).toEqual(1);
    expect(parseTime('1 years').years).toEqual(1);
    expect(parseTime('1year').years).toEqual(1);
    expect(parseTime('1   yr').years).toEqual(1);
    expect(parseTime('  1    year   ').years).toEqual(1);
    expect(parseTime('  1 years   ').years).toEqual(1);
  });

  it('should parse -year', () => {
    expect(parseTime('- 1 yr').years).toEqual(-1);
    expect(parseTime('- 1 year').years).toEqual(-1);
    expect(parseTime('-1 year').years).toEqual(-1);
    expect(parseTime('- 1 years').years).toEqual(-1);
    expect(parseTime('- 1year').years).toEqual(-1);
    expect(parseTime('- 1   yr').years).toEqual(-1);
    expect(parseTime('  - 1    year   ').years).toEqual(-1);
    expect(parseTime('  -  1 years   ').years).toEqual(-1);
  });

  it('should parse +year', () => {
    expect(parseTime('+ 1 yr').years).toEqual(1);
    expect(parseTime('+ 1 year').years).toEqual(1);
    expect(parseTime('+1 year').years).toEqual(1);
    expect(parseTime('+ 1 years').years).toEqual(1);
    expect(parseTime('+ 1year').years).toEqual(1);
    expect(parseTime('+ 1   yr').years).toEqual(1);
    expect(parseTime('  + 1    year   ').years).toEqual(1);
    expect(parseTime('  +  1 years   ').years).toEqual(1);
  });

  it('should parse month', () => {
    expect(parseTime('1mo').months).toEqual(1);
    expect(parseTime('1 mo').months).toEqual(1);
    expect(parseTime('1 month').months).toEqual(1);
    expect(parseTime('1 months').months).toEqual(1);
    expect(parseTime('1month').months).toEqual(1);
    expect(parseTime('1    mo').months).toEqual(1);
    expect(parseTime('  1    month   ').months).toEqual(1);
    expect(parseTime('  1 months   ').months).toEqual(1);
  });

  it('should parse -month', () => {
    expect(parseTime('- 1mo').months).toEqual(-1);
    expect(parseTime('- 1 mo').months).toEqual(-1);
    expect(parseTime(' -1 mo').months).toEqual(-1);
    expect(parseTime('- 1 month').months).toEqual(-1);
    expect(parseTime('- 1 months').months).toEqual(-1);
    expect(parseTime('- 1month').months).toEqual(-1);
    expect(parseTime('- 1    mo').months).toEqual(-1);
    expect(parseTime('  - 1    month   ').months).toEqual(-1);
    expect(parseTime('  - 1 months   ').months).toEqual(-1);
  });

  it('should parse week', () => {
    expect(parseTime('1w').weeks).toEqual(1);
    expect(parseTime('1 wk').weeks).toEqual(1);
    expect(parseTime('1 week').weeks).toEqual(1);
    expect(parseTime('1 weeks').weeks).toEqual(1);
    expect(parseTime('1week').weeks).toEqual(1);
    expect(parseTime('1    wk').weeks).toEqual(1);
    expect(parseTime('  1    week   ').weeks).toEqual(1);
    expect(parseTime('  1 weeks   ').weeks).toEqual(1);
  });

  it('should parse day', () => {
    expect(parseTime('1d').days).toEqual(1);
    expect(parseTime('1 d').days).toEqual(1);
    expect(parseTime('1 day').days).toEqual(1);
    expect(parseTime('1 days').days).toEqual(1);
    expect(parseTime('1day').days).toEqual(1);
    expect(parseTime('1    d').days).toEqual(1);
    expect(parseTime('  1    day   ').days).toEqual(1);
    expect(parseTime('  1 days   ').days).toEqual(1);
  });

  it('should parse (n) days', () => {
    expect(parseTime('3d').days).toEqual(3);
    expect(parseTime('3 d').days).toEqual(3);
    expect(parseTime('3 day').days).toEqual(3);
    expect(parseTime('3 days').days).toEqual(3);
    expect(parseTime('3day').days).toEqual(3);
    expect(parseTime('3    d').days).toEqual(3);
    expect(parseTime('  3    day   ').days).toEqual(3);
    expect(parseTime('  3 days   ').days).toEqual(3);
  });

  it('should parse (n) hours', () => {
    expect(parseTime('45h').hours).toEqual(45);
    expect(parseTime('45 h').hours).toEqual(45);
    expect(parseTime('45 hour').hours).toEqual(45);
    expect(parseTime('45 hours').hours).toEqual(45);
    expect(parseTime('45hours').hours).toEqual(45);
    expect(parseTime('45    h').hours).toEqual(45);
    expect(parseTime('  45    hour   ').hours).toEqual(45);
    expect(parseTime('  45 hours   ').hours).toEqual(45);
  });

  it('should parse (n) minutes', () => {
    expect(parseTime('45min').minutes).toEqual(45);
    expect(parseTime('45 min').minutes).toEqual(45);
    expect(parseTime('45 minute').minutes).toEqual(45);
    expect(parseTime('45 minutes').minutes).toEqual(45);
    expect(parseTime('45minutes').minutes).toEqual(45);
    expect(parseTime('45m').minutes).toEqual(45);
    expect(parseTime('45    min').minutes).toEqual(45);
    expect(parseTime('  45    min   ').minutes).toEqual(45);
    expect(parseTime('  45 minutes   ').minutes).toEqual(45);
  });

  it('should parse (n) seconds', () => {
    expect(parseTime('45 s').seconds).toEqual(45);
    expect(parseTime('45 s').seconds).toEqual(45);
    expect(parseTime('45 sec').seconds).toEqual(45);
    expect(parseTime('45 second').seconds).toEqual(45);
    expect(parseTime('45 seconds').seconds).toEqual(45);
    expect(parseTime('45seconds').seconds).toEqual(45);
    expect(parseTime('45    s').seconds).toEqual(45);
    expect(parseTime('  45    sec   ').seconds).toEqual(45);
    expect(parseTime('  45 seconds   ').seconds).toEqual(45);
  });

  it('should parse complex time-string', () => {
    expect(parseTime('1yr2mo3w4d5h6min7s').years).toEqual(1);
    expect(parseTime('1yr2mo3w4d5h6min7s').months).toEqual(2);
    expect(parseTime('1yr2mo3w4d5h6min7s').weeks).toEqual(3);
    expect(parseTime('1yr2mo3w4d5h6min7s').days).toEqual(4);
    expect(parseTime('1yr2mo3w4d5h6min7s').hours).toEqual(5);
    expect(parseTime('1yr2mo3w4d5h6min7s').minutes).toEqual(6);
    expect(parseTime('1yr2mo3w4d5h6min7s').seconds).toEqual(7);
    expect(parseTime('2d3h').minutes).toEqual(0);
    expect(parseTime('2d0h').hours).toEqual(0);
  });

  it('should parse negative complex time-string', () => {
    expect(parseTime('-1yr2mo3w4d5h6min7s').years).toEqual(-1);
    expect(parseTime('-1yr2mo3w4d5h6min7s').months).toEqual(-2);
    expect(parseTime('-1yr2mo3w4d5h6min7s').weeks).toEqual(-3);
    expect(parseTime('-1yr2mo3w4d5h6min7s').days).toEqual(-4);
    expect(parseTime('-1yr2mo3w4d5h6min7s').hours).toEqual(-5);
    expect(parseTime('-1yr2mo3w4d5h6min7s').minutes).toEqual(-6);
    expect(parseTime('-1yr2mo3w4d5h6min7s').seconds).toEqual(-7);
    expect(parseTime('-2d3h').minutes).toEqual(-0);
    expect(parseTime('-2d0h').hours).toEqual(-0);
  });
});
