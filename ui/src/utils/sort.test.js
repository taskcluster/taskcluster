import sort from './sort';

it('should sort', () => {
  expect(sort('a', 'b')).toBe(-1);
  expect(sort('b', 'a')).toBe(1);

  expect(sort(1, 100)).toBe(-1);
  expect(sort(100, 1)).toBe(1);

  expect(sort('2022-02-22T12:12:12', '2022-12-12T22:22:22')).toBe(-1);
  expect(sort('2032-02-22T12:12:12', '2022-12-12T22:22:22')).toBe(1);
});
