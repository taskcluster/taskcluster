import { findKeyInMap } from './mapUtils';

it('findKeyInMap', () => {
  const map = new Map([
    ['a', 1],
    ['b', 2],
    ['c', 3],
    ['d', 4],
  ]);

  expect(findKeyInMap({ map, value: 1 })).toBe('a');
  expect(findKeyInMap({ map, value: 2 })).toBe('b');
  expect(findKeyInMap({ map, value: 3 })).toBe('c');
  expect(findKeyInMap({ map, value: 4 })).toBe('d');
  expect(findKeyInMap({ map, value: 5 })).toBe(undefined);
});
