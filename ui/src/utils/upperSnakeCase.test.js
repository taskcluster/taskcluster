import upperSnakeCase from './upperSnakeCase';

it('should upper snake case', () => {
  expect(upperSnakeCase('foo')).toBe('FOO');
  expect(upperSnakeCase('foo api bar irc')).toBe('FOO_API_BAR_IRC');
});
