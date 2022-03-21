import isWorkerTypeNameValid from './isWorkerTypeNameValid';

it('should return true if the worker type name is valid', () => {
  expect(isWorkerTypeNameValid('')).toBeFalsy();
  expect(isWorkerTypeNameValid('^^^^^')).toBeFalsy();
  expect(isWorkerTypeNameValid('foo')).toBeTruthy();
  expect(isWorkerTypeNameValid('foo-bar')).toBeTruthy();
  expect(isWorkerTypeNameValid('foo-bar-baz-qux-quux')).toBeTruthy();
  expect(
    isWorkerTypeNameValid('very-long-and-invalid-worker-type-name-99999999999')
  ).toBeFalsy();
});
