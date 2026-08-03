import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MuiThemeProvider } from '@material-ui/core/styles';
import appTheme from '../../theme';

// Record the props the debugger is rendered with, and stub out the heavy
// editor/table children so HookForm renders cleanly in jsdom.
const { debugger: dbg } = vi.hoisted(() => ({ debugger: { lastProps: null } }));

vi.mock('../HookBindingDebugger', () => ({
  default: props => {
    dbg.lastProps = props;

    return null;
  },
}));
vi.mock('../CodeEditor', () => ({ default: () => null }));
vi.mock('../MarkdownTextArea', () => ({ default: () => null }));
vi.mock('../HookLastFiredTable', () => ({ default: () => null }));
vi.mock('../AuditHistorySpeedDialAction', () => ({ default: () => null }));

import HookForm from './index';

const makeHook = (bindings = []) => ({
  hookGroupId: 'my-group',
  hookId: 'my-hook',
  schedule: [],
  bindings,
  metadata: {
    name: 'n',
    description: '',
    owner: 'o@example.com',
    emailOnError: true,
  },
  status: { nextScheduledDate: null },
  task: { payload: {} },
  triggerSchema: { type: 'object', additionalProperties: false },
});

const withBindings = [
  { exchange: 'exchange/foo/v1/thing', routingKeyPattern: '#' },
];

const tree = hook => (
  <MemoryRouter keyLength={0}>
    <MuiThemeProvider theme={appTheme.darkTheme}>
      <HookForm hook={hook} />
    </MuiThemeProvider>
  </MemoryRouter>
);

const renderForm = hook => render(tree(hook));

afterEach(() => {
  dbg.lastProps = null;
  cleanup();
});

describe('HookForm binding debugger wiring', () => {
  it('validates against the saved props.hook, not unsaved form edits', () => {
    const savedSchema = { type: 'object', additionalProperties: false };
    const { getByText } = renderForm({
      ...makeHook(withBindings),
      triggerSchema: savedSchema,
    });

    fireEvent.click(getByText('Debug bindings'));

    // the debugger receives the saved bindings + schema
    expect(dbg.lastProps.bindings).toEqual(withBindings);
    expect(dbg.lastProps.triggerSchema).toEqual(savedSchema);
    expect(dbg.lastProps.open).toBe(true);
  });

  it('closes the debugger (no stale open) when saved bindings disappear and are re-added', () => {
    const { getByText, rerender } = renderForm(makeHook(withBindings));

    fireEvent.click(getByText('Debug bindings'));
    expect(dbg.lastProps.open).toBe(true);

    // a save removes the bindings -> debugger unmounts and debuggerOpen clears
    rerender(tree(makeHook([])));

    // bindings added back later -> debugger remounts but must NOT auto-open
    rerender(tree(makeHook(withBindings)));

    expect(dbg.lastProps.open).toBe(false);
  });

  it('does not show the Debug bindings button when the saved hook has no bindings', () => {
    const { queryByText } = renderForm(makeHook([]));

    expect(queryByText('Debug bindings')).toBeNull();
  });
});
