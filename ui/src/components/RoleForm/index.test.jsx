import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import appTheme from '../../theme';

vi.mock('../MarkdownTextArea', () => ({ default: () => null }));
vi.mock('../DiffTextArea', () => ({ default: () => null }));
vi.mock('../AuditHistorySpeedDialAction', () => ({ default: () => null }));

import RoleForm from './index';

const renderForm = role =>
  render(
    <MemoryRouter keyLength={0}>
      <ThemeProvider theme={appTheme.darkTheme}>
        <RoleForm
          role={{
            description: '',
            scopes: [],
            created: '2026-01-01T00:00:00.000Z',
            lastModified: '2026-01-01T00:00:00.000Z',
            ...role,
          }}
          onRoleSave={() => {}}
          onRoleDelete={() => {}}
          onDialogActionOpen={() => {}}
          onDialogActionClose={() => {}}
        />
      </ThemeProvider>
    </MemoryRouter>
  );

// The highlighted padding is rendered as its own span holding only spaces.
const paddingSpans = container =>
  Array.from(container.querySelectorAll('span')).filter(span =>
    /^ +$/.test(span.textContent)
  );

describe('RoleForm', () => {
  it('marks padding in the role ID and in expanded scopes', () => {
    const { container } = renderForm({
      roleId: 'project:example ',
      expandedScopes: [' queue:create-task:highest:proj-example/*'],
    });

    expect(paddingSpans(container)).toHaveLength(2);
  });

  it('marks nothing when there is no padding', () => {
    const { container } = renderForm({
      roleId: 'project:example',
      expandedScopes: ['queue:create-task:highest:proj-example/*'],
    });

    expect(paddingSpans(container)).toHaveLength(0);
  });
});
