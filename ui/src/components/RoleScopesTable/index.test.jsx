import React from 'react';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import renderWithTheme from '../../utils/renderWithTheme';
import RoleScopesTable from './index';

describe('RoleScopesTable', () => {
  it('keeps a padded role ID in one element next to the link icon', () => {
    renderWithTheme(
      <MemoryRouter keyLength={0}>
        <RoleScopesTable
          roles={[
            { roleId: ' project:example ', expandedScopes: ['queue:foo'] },
          ]}
          selectedScope="queue:foo"
        />
      </MemoryRouter>
    );

    const row = screen.getByRole('button');

    // One element for the role ID and one for the icon, so the row's
    // space-between layout can't push the padding away from the ID.
    expect(row.children).toHaveLength(2);
    expect(row.children[0].textContent).toBe(' project:example ');
  });
});
