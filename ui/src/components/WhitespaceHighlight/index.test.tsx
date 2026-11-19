import { describe, expect, it } from 'vitest';
import renderWithTheme from '../../utils/renderWithTheme';
import WhitespaceHighlight from './index';

const render = (text: string) => {
  const { container } = renderWithTheme(<WhitespaceHighlight text={text} />);
  const root = container.firstElementChild as HTMLElement;
  const pads = Array.from(root.children).map(pad => pad.textContent);

  return { root, pads };
};

describe('WhitespaceHighlight', () => {
  it('renders the text without padding marks when there is none', () => {
    const { root, pads } = render('assume:project:example');

    expect(root.textContent).toBe('assume:project:example');
    expect(pads).toEqual([]);
  });

  it('marks leading and trailing spaces', () => {
    const { root, pads } = render('  assume:project:example ');

    expect(root.textContent).toBe('  assume:project:example ');
    expect(pads).toEqual(['  ', ' ']);
  });

  it('marks only the side that has padding', () => {
    expect(render('project:example ').pads).toEqual([' ']);
    expect(render(' project:example').pads).toEqual([' ']);
  });

  it('does not mark spaces in the middle', () => {
    const { root, pads } = render('project:my role');

    expect(root.textContent).toBe('project:my role');
    expect(pads).toEqual([]);
  });

  it('wraps everything in a single element', () => {
    const { container } = renderWithTheme(
      <WhitespaceHighlight text=" project:example " />
    );

    expect(container.childNodes).toHaveLength(1);
  });
});
