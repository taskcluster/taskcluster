import { expect } from 'chai';
import parseTime from '../src/utils/parseTime';

describe('parseTime', function() {
  it('should parse year', () => {
    expect(parseTime('1 yr').years).to.equal(1);
    expect(parseTime('1 year').years).to.equal(1);
    expect(parseTime('1 years').years).to.equal(1);
    expect(parseTime('1year').years).to.equal(1);
    expect(parseTime('1   yr').years).to.equal(1);
    expect(parseTime('  1    year   ').years).to.equal(1);
    expect(parseTime('  1 years   ').years).to.equal(1);
  });

  it('should parse -year', () => {
    expect(parseTime('- 1 yr').years).to.equal(-1);
    expect(parseTime('- 1 year').years).to.equal(-1);
    expect(parseTime('-1 year').years).to.equal(-1);
    expect(parseTime('- 1 years').years).to.equal(-1);
    expect(parseTime('- 1year').years).to.equal(-1);
    expect(parseTime('- 1   yr').years).to.equal(-1);
    expect(parseTime('  - 1    year   ').years).to.equal(-1);
    expect(parseTime('  -  1 years   ').years).to.equal(-1);
  });

  it('should parse +year', () => {
    expect(parseTime('+ 1 yr').years).to.equal(1);
    expect(parseTime('+ 1 year').years).to.equal(1);
    expect(parseTime('+1 year').years).to.equal(1);
    expect(parseTime('+ 1 years').years).to.equal(1);
    expect(parseTime('+ 1year').years).to.equal(1);
    expect(parseTime('+ 1   yr').years).to.equal(1);
    expect(parseTime('  + 1    year   ').years).to.equal(1);
    expect(parseTime('  +  1 years   ').years).to.equal(1);
  });

  it('should parse month', () => {
    expect(parseTime('1mo').months).to.equal(1);
    expect(parseTime('1 mo').months).to.equal(1);
    expect(parseTime('1 month').months).to.equal(1);
    expect(parseTime('1 months').months).to.equal(1);
    expect(parseTime('1month').months).to.equal(1);
    expect(parseTime('1    mo').months).to.equal(1);
    expect(parseTime('  1    month   ').months).to.equal(1);
    expect(parseTime('  1 months   ').months).to.equal(1);
  });

  it('should parse -month', () => {
    expect(parseTime('- 1mo').months).to.equal(-1);
    expect(parseTime('- 1 mo').months).to.equal(-1);
    expect(parseTime(' -1 mo').months).to.equal(-1);
    expect(parseTime('- 1 month').months).to.equal(-1);
    expect(parseTime('- 1 months').months).to.equal(-1);
    expect(parseTime('- 1month').months).to.equal(-1);
    expect(parseTime('- 1    mo').months).to.equal(-1);
    expect(parseTime('  - 1    month   ').months).to.equal(-1);
    expect(parseTime('  - 1 months   ').months).to.equal(-1);
  });

  it('should parse week', () => {
    expect(parseTime('1w').weeks).to.equal(1);
    expect(parseTime('1 wk').weeks).to.equal(1);
    expect(parseTime('1 week').weeks).to.equal(1);
    expect(parseTime('1 weeks').weeks).to.equal(1);
    expect(parseTime('1week').weeks).to.equal(1);
    expect(parseTime('1    wk').weeks).to.equal(1);
    expect(parseTime('  1    week   ').weeks).to.equal(1);
    expect(parseTime('  1 weeks   ').weeks).to.equal(1);
  });

  it('should parse day', () => {
    expect(parseTime('1d').days).to.equal(1);
    expect(parseTime('1 d').days).to.equal(1);
    expect(parseTime('1 day').days).to.equal(1);
    expect(parseTime('1 days').days).to.equal(1);
    expect(parseTime('1day').days).to.equal(1);
    expect(parseTime('1    d').days).to.equal(1);
    expect(parseTime('  1    day   ').days).to.equal(1);
    expect(parseTime('  1 days   ').days).to.equal(1);
  });

  it('should parse (n) days', () => {
    expect(parseTime('3d').days).to.equal(3);
    expect(parseTime('3 d').days).to.equal(3);
    expect(parseTime('3 day').days).to.equal(3);
    expect(parseTime('3 days').days).to.equal(3);
    expect(parseTime('3day').days).to.equal(3);
    expect(parseTime('3    d').days).to.equal(3);
    expect(parseTime('  3    day   ').days).to.equal(3);
    expect(parseTime('  3 days   ').days).to.equal(3);
  });

  it('should parse (n) hours', () => {
    expect(parseTime('45h').hours).to.equal(45);
    expect(parseTime('45 h').hours).to.equal(45);
    expect(parseTime('45 hour').hours).to.equal(45);
    expect(parseTime('45 hours').hours).to.equal(45);
    expect(parseTime('45hours').hours).to.equal(45);
    expect(parseTime('45    h').hours).to.equal(45);
    expect(parseTime('  45    hour   ').hours).to.equal(45);
    expect(parseTime('  45 hours   ').hours).to.equal(45);
  });

  it('should parse (n) minutes', () => {
    expect(parseTime('45min').minutes).to.equal(45);
    expect(parseTime('45 min').minutes).to.equal(45);
    expect(parseTime('45 minute').minutes).to.equal(45);
    expect(parseTime('45 minutes').minutes).to.equal(45);
    expect(parseTime('45minutes').minutes).to.equal(45);
    expect(parseTime('45m').minutes).to.equal(45);
    expect(parseTime('45    min').minutes).to.equal(45);
    expect(parseTime('  45    min   ').minutes).to.equal(45);
    expect(parseTime('  45 minutes   ').minutes).to.equal(45);
  });

  it('should parse (n) seconds', () => {
    expect(parseTime('45 s').seconds).to.equal(45);
    expect(parseTime('45 s').seconds).to.equal(45);
    expect(parseTime('45 sec').seconds).to.equal(45);
    expect(parseTime('45 second').seconds).to.equal(45);
    expect(parseTime('45 seconds').seconds).to.equal(45);
    expect(parseTime('45seconds').seconds).to.equal(45);
    expect(parseTime('45    s').seconds).to.equal(45);
    expect(parseTime('  45    sec   ').seconds).to.equal(45);
    expect(parseTime('  45 seconds   ').seconds).to.equal(45);
  });

  it('should parse complex time-string', () => {
    expect(parseTime('1yr2mo3w4d5h6min7s').years).to.equal(1);
    expect(parseTime('1yr2mo3w4d5h6min7s').months).to.equal(2);
    expect(parseTime('1yr2mo3w4d5h6min7s').weeks).to.equal(3);
    expect(parseTime('1yr2mo3w4d5h6min7s').days).to.equal(4);
    expect(parseTime('1yr2mo3w4d5h6min7s').hours).to.equal(5);
    expect(parseTime('1yr2mo3w4d5h6min7s').minutes).to.equal(6);
    expect(parseTime('1yr2mo3w4d5h6min7s').seconds).to.equal(7);
    expect(parseTime('2d3h').minutes).to.equal(0);
    expect(parseTime('2d0h').hours).to.equal(0);
  });

  it('should parse negative complex time-string', () => {
    expect(parseTime('-1yr2mo3w4d5h6min7s').years).to.equal(-1);
    expect(parseTime('-1yr2mo3w4d5h6min7s').months).to.equal(-2);
    expect(parseTime('-1yr2mo3w4d5h6min7s').weeks).to.equal(-3);
    expect(parseTime('-1yr2mo3w4d5h6min7s').days).to.equal(-4);
    expect(parseTime('-1yr2mo3w4d5h6min7s').hours).to.equal(-5);
    expect(parseTime('-1yr2mo3w4d5h6min7s').minutes).to.equal(-6);
    expect(parseTime('-1yr2mo3w4d5h6min7s').seconds).to.equal(-7);
    expect(parseTime('-2d3h').minutes).to.equal(0);
    expect(parseTime('-2d0h').hours).to.equal(0);
  });
});
