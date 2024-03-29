import { addMinutes } from 'date-fns';
import isDateWithin from './isDateWithin';

describe('isDateWithin', () => {
  const d = new Date('2020-05-05T01:00:00.000Z');

  it('should return true', () => {
    [46, 60, 119, -46, -60, -119].forEach(t => {
      expect(isDateWithin(addMinutes(d, t), d, 45, 120)).toBeTruthy();
    });
  });

  it('should return false', () => {
    [42, 1, 2, -42, -1, -2].forEach(t => {
      expect(isDateWithin(addMinutes(d, t), d, 45, 120)).toBeFalsy();
    });
  });
});
