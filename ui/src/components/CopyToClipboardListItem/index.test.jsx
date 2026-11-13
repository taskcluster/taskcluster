import React from 'react';
import { screen } from '@testing-library/react';
import renderWithTheme from '../../utils/renderWithTheme';
import CopyToClipboardListItem from './index';

describe('CopyToClipboardListItem', () => {
  it('renders a normal item when textToCopy is empty', () => {
    renderWithTheme(<CopyToClipboardListItem primary="Foo" />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Foo').closest('[title]')).toBeNull();
  });

  it('tooltip defaults to textToCopy', () => {
    renderWithTheme(<CopyToClipboardListItem textToCopy="foo" primary="Bar" />);

    expect(screen.getByRole('button').getAttribute('title')).toBe('foo (Copy)');
  });

  it('uses tooltipTitle when given', () => {
    renderWithTheme(
      <CopyToClipboardListItem
        textToCopy="foo"
        tooltipTitle="bar"
        primary="Baz"
      />
    );

    expect(screen.getByRole('button').getAttribute('title')).toBe('bar (Copy)');
  });

  it('omits the prefix when tooltipTitle is empty', () => {
    renderWithTheme(
      <CopyToClipboardListItem textToCopy="foo" tooltipTitle="" primary="Bar" />
    );

    expect(screen.getByRole('button').getAttribute('title')).toBe('Copy');
  });
});
