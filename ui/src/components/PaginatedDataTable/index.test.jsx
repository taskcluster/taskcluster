import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TableCell, TableRow } from '@material-ui/core';
import PaginatedDataTable from './index';

const renderTable = props =>
  render(
    <PaginatedDataTable
      items={[{ id: 'a' }]}
      renderRow={(item, style, key) => (
        <TableRow key={key ?? item.id} style={style}>
          <TableCell>{item.id}</TableCell>
        </TableRow>
      )}
      pageSize={10}
      page={0}
      onNextPage={vi.fn()}
      onPreviousPage={vi.fn()}
      headers={['Task ID']}
      {...props}
    />
  );

describe('PaginatedDataTable headers', () => {
  it('shows plain header labels when no onHeaderClick is given', () => {
    renderTable();

    expect(screen.getByText('Task ID')).toBeTruthy();
    // A sort label renders as a button, which nothing would handle here.
    expect(screen.queryByRole('button', { name: 'Task ID' })).toBeNull();
  });

  it('shows sortable headers and reports the clicked header with onHeaderClick', () => {
    const onHeaderClick = vi.fn();

    renderTable({ onHeaderClick });
    fireEvent.click(screen.getByRole('button', { name: 'Task ID' }));

    expect(onHeaderClick).toHaveBeenCalledWith('Task ID');
  });
});
