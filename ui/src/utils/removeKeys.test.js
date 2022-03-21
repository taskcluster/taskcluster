import removeKeys from './removeKeys';

it('should remove keys', () => {
  expect(removeKeys({ a: 1 }, [])).toEqual({ a: 1 });
  expect(removeKeys({ a: 'str' }, ['a'])).toEqual({});
  expect(
    removeKeys(
      {
        a: 'str',
        ok: 41,
        nested: {
          a: 'str2',
          ok: 42,
        },
      },
      ['a']
    )
  ).toEqual({
    ok: 41,
    nested: {
      ok: 42,
    },
  });
});
