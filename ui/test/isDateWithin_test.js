import { expect } from 'chai';
import fromNow from '../src/utils/fromNow';
import isDateWithin from '../src/utils/isDateWithin';

describe('isDateWithin', () => {
  it('should return true', () => {
    [
      '45 minutes',
      '60 minutes',
      '119 minutes',
      '-45 minutes',
      '-60 minutes',
      '-119 minutes',
    ].forEach(t => {
      expect(isDateWithin(fromNow(t), '44', '120')).to.be.true;
    });
  });

  it('should return false', () => {
    [
      '44 minutes',
      '1 minute',
      '2 hours',
      '-44 minutes',
      '- 1 minute',
      '- 2 hours',
    ].forEach(t => {
      expect(isDateWithin(fromNow(t), '44', '120')).to.be.false;
    });
  });
});
