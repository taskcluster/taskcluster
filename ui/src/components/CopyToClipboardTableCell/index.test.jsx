import React from 'react';
import { screen } from '@testing-library/react';
import renderWithTheme from '../../utils/renderWithTheme';
import CopyToClipboardTableCell from './index';

function renderCell(props) {
  return renderWithTheme(
    <table>
      <tbody>
        <tr>
          <CopyToClipboardTableCell {...props} />
        </tr>
      </tbody>
    </table>
  );
}

describe('CopyToClipboardTableCell', () => {
  it('renders a normal  cell when textToCopy is empty', () => {
    renderCell({ text: 'n/a' });

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('n/a').closest('[title]')).toBeNull();
  });

  it('uses textToCopy as the tooltip by default', () => {
    renderCell({ textToCopy: 'foo', text: 'bar' });

    expect(
      screen.getByText('bar').closest('[title]').getAttribute('title')
    ).toBe('foo (Copy)');
  });

  it('uses tooltipTitle when given', () => {
    renderCell({ textToCopy: 'foo', tooltipTitle: 'bar', text: 'baz' });

    expect(
      screen.getByText('baz').closest('[title]').getAttribute('title')
    ).toBe('bar (Copy)');
  });

  it('omits the prefix when tooltipTitle is empty', () => {
    renderCell({ textToCopy: 'foo', tooltipTitle: '', text: 'baz' });

    expect(
      screen.getByText('baz').closest('[title]').getAttribute('title')
    ).toBe('Copy');
  });
});
