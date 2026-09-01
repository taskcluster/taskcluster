import React from 'react';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import { MuiThemeProvider } from '@material-ui/core/styles';
import appTheme from '../../theme';
import HookBindingDebugger from './index';

// Control the single pulse-subscription seam so tests can drive messages/errors
// and observe teardown, without a live websocket.
const { subscribeMock, teardownMock, hook } = vi.hoisted(() => {
  const teardownMock = vi.fn();
  const hook = { handlers: null };
  const subscribeMock = vi.fn((_bindings, handlers) => {
    hook.handlers = handlers;

    return teardownMock;
  });

  return { subscribeMock, teardownMock, hook };
});

vi.mock('../../utils/pulseListener', () => ({
  default: subscribeMock,
}));

const bindings = [
  { exchange: 'exchange/foo/v1/thing', routingKeyPattern: '#.bar.#' },
];
// default hook schema: only an empty {} payload validates
const defaultSchema = { type: 'object', additionalProperties: false };

const tree = props => (
  <MuiThemeProvider theme={appTheme.darkTheme}>
    <HookBindingDebugger
      open
      onClose={vi.fn()}
      bindings={bindings}
      triggerSchema={defaultSchema}
      {...props}
    />
  </MuiThemeProvider>
);

const renderDebugger = props => render(tree(props));

const start = getByText => {
  fireEvent.click(getByText('Start'));
};

const deliver = message => {
  act(() => {
    hook.handlers.onMessage(message);
  });
};

const pulse = (payload, overrides = {}) => ({
  exchange: 'exchange/foo/v1/thing',
  routingKey: 'a.bar.b',
  payload,
  ...overrides,
});

beforeEach(() => {
  subscribeMock.mockClear();
  teardownMock.mockClear();
  hook.handlers = null;
});

afterEach(() => {
  cleanup();
});

describe('HookBindingDebugger', () => {
  it('lists the saved bindings and does not auto-start on open', () => {
    const { getByText } = renderDebugger();

    expect(getByText('exchange/foo/v1/thing')).toBeTruthy();
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(getByText('Start')).toBeTruthy();
  });

  it('shows one row per message with a verdict icon, and reveals the error on expand', () => {
    const { getByText, queryByText, getByLabelText, getAllByTestId } =
      renderDebugger();

    start(getByText);
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    // empty payload passes the default schema
    deliver(pulse({}));
    // non-empty payload is rejected (the #8867 scenario)
    deliver(pulse({ foo: 'bar' }, { routingKey: 'c.bar.d' }));

    // one collapsed row per message, each with a verdict icon
    const rows = getAllByTestId('pulse-message');

    expect(rows).toHaveLength(2);
    expect(getByLabelText('passed')).toBeTruthy();
    expect(getByLabelText('rejected')).toBeTruthy();

    // cumulative counters in the summary
    expect(queryByText(/1 passed/)).toBeTruthy();
    expect(queryByText(/1 rejected/)).toBeTruthy();

    // error text is hidden until the row is expanded (newest first -> rejected)
    expect(queryByText('data must NOT have additional properties')).toBeNull();
    fireEvent.click(rows[0]);
    expect(getByText('data must NOT have additional properties')).toBeTruthy();
  });

  it('tears down on Stop and does not double-invoke teardown on unmount', () => {
    const { getByText, unmount } = renderDebugger();

    start(getByText);
    fireEvent.click(getByText('Stop'));
    expect(teardownMock).toHaveBeenCalledTimes(1);

    unmount();
    // unsubscribeFn was cleared after Stop, so unmount must not call it again
    expect(teardownMock).toHaveBeenCalledTimes(1);
  });

  it('tears down when a subscription error arrives and surfaces the error', () => {
    const { getByText } = renderDebugger();

    start(getByText);
    act(() => {
      hook.handlers.onError(new Error('kaboom'));
    });

    expect(teardownMock).toHaveBeenCalledTimes(1);
    // back to the idle Start control
    expect(getByText('Start')).toBeTruthy();
  });

  it('translates an InsufficientScopes failure into a web:read-pulse message', () => {
    const { getByText } = renderDebugger();

    start(getByText);
    act(() => {
      hook.handlers.onError(new Error('Error: InsufficientScopes ...'));
    });

    expect(getByText(/web:read-pulse/)).toBeTruthy();
  });

  it('tears down when the parent closes the drawer (open -> false)', () => {
    const { getByText, rerender } = renderDebugger();

    start(getByText);
    rerender(tree({ open: false }));

    expect(teardownMock).toHaveBeenCalledTimes(1);
  });

  it('restarts, recompiles, and clears stale verdicts when the saved triggerSchema changes', () => {
    const { getByText, queryByText, queryAllByTestId, rerender } =
      renderDebugger();

    start(getByText);
    // rejected under the strict default schema
    deliver(pulse({ foo: 'bar' }));
    expect(queryAllByTestId('pulse-message')).toHaveLength(1);
    expect(queryByText(/1 rejected/)).toBeTruthy();

    // saved schema is relaxed to accept anything -> restart + recompile
    rerender(
      tree({ triggerSchema: { type: 'object', additionalProperties: true } })
    );

    // subscription was torn down and re-established
    expect(teardownMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledTimes(2);

    // stale rows + counters from the previous schema are cleared
    expect(queryAllByTestId('pulse-message')).toHaveLength(0);
    expect(queryByText(/0 passed/)).toBeTruthy();
    expect(queryByText(/0 rejected/)).toBeTruthy();

    // the same payload now passes under the new schema
    deliver(pulse({ foo: 'bar' }, { routingKey: 'z.bar.z' }));
    expect(queryAllByTestId('pulse-message')).toHaveLength(1);
    expect(queryByText(/1 passed/)).toBeTruthy();
  });

  it('clears stale verdicts when the saved bindings change', () => {
    const { getByText, queryByText, queryAllByTestId, rerender } =
      renderDebugger();

    start(getByText);
    deliver(pulse({}));
    expect(queryAllByTestId('pulse-message')).toHaveLength(1);
    expect(queryByText(/1 passed/)).toBeTruthy();

    // saved bindings change -> restart against new bindings and drop old rows
    rerender(
      tree({
        bindings: [{ exchange: 'exchange/other/v1/x', routingKeyPattern: '#' }],
      })
    );

    expect(queryAllByTestId('pulse-message')).toHaveLength(0);
    expect(queryByText(/0 passed/)).toBeTruthy();
    expect(subscribeMock).toHaveBeenCalledTimes(2);
  });

  it('stops listening (never classifies) when the saved schema becomes malformed', () => {
    const { getByText, queryByText, queryAllByTestId, rerender } =
      renderDebugger();

    start(getByText);
    deliver(pulse({}));
    expect(queryByText(/1 passed/)).toBeTruthy();

    // saved schema becomes invalid -> stop rather than restart
    rerender(tree({ triggerSchema: { type: 'not-a-real-type' } }));

    expect(teardownMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledTimes(1); // no restart
    expect(getByText(/not a valid JSON schema/)).toBeTruthy();
    // back to an idle, disabled Start control
    expect(getByText('Start').closest('button').disabled).toBe(true);

    // a late message on the stale handler must NOT be classified (no new row)
    deliver(pulse({ anything: true }));
    expect(queryAllByTestId('pulse-message')).toHaveLength(0);
    expect(queryByText(/0 passed/)).toBeTruthy();
  });

  it('shows a schema-error state and disables Start for a malformed triggerSchema', () => {
    const { getByText } = renderDebugger({
      triggerSchema: { type: 'not-a-real-type' },
    });

    expect(getByText(/not a valid JSON schema/)).toBeTruthy();
    expect(getByText('Start').closest('button').disabled).toBe(true);
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('keeps rows unique per message even with identical exchange/routingKey', () => {
    const { getByText, getAllByTestId } = renderDebugger();

    start(getByText);
    deliver(pulse({}));
    deliver(pulse({}));

    // two distinct rows despite identical exchange + routingKey (monotonic id key)
    expect(getAllByTestId('pulse-message')).toHaveLength(2);
  });

  it('caps retained rows at 250 while cumulative counters keep climbing', () => {
    const { getByText, queryByText, getAllByTestId } = renderDebugger();

    start(getByText);
    act(() => {
      for (let i = 0; i < 253; i++) {
        hook.handlers.onMessage(pulse({}, { routingKey: `k.${i}` }));
      }
    });

    expect(getAllByTestId('pulse-message')).toHaveLength(250);
    expect(queryByText(/253 passed/)).toBeTruthy();
  });
});
