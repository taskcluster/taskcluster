import { enableTerminate, terminateDisabled } from './terminate';

it('should enable termination based on state', () => {
  expect(enableTerminate('requested')).toBe(true);
  expect(enableTerminate('running')).toBe(true);
  expect(enableTerminate('stopping')).toBe(false);
  expect(enableTerminate('stopped')).toBe(false);
});

it('should disable termination based on state and providerId', () => {
  expect(terminateDisabled('requested', 'none')).toBe(true);
  expect(terminateDisabled('running', 'provider')).toBe(false);
  expect(terminateDisabled('stopping', 'provider')).toBe(true);
  expect(terminateDisabled('stopped', 'static')).toBe(true);
});
