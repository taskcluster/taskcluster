import titleCase from './titleCase';

it('should upper case', () => {
  expect(titleCase('foo')).toBe('Foo');
  expect(titleCase('foo api bar irc')).toBe('Foo API Bar IRC');
});
