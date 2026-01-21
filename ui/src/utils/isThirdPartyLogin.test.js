import isThirdPartyLogin from './isThirdPartyLogin';

it('is third-party login', () => {
  expect(isThirdPartyLogin()).toBe(false);

  const assignMock = vi.fn();

  delete window.location;
  window.location = {
    assign: assignMock,
    search: '?client_id=foo&response_type=bar&scope=baz&redirect_uri=qux',
  };

  expect(isThirdPartyLogin()).toBe(true);
});
