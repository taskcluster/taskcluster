import splitLines from './splitLines';

it('should split lines', () => {
  expect(splitLines('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
});
