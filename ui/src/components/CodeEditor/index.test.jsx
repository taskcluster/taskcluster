import React from 'react';
import { render } from '@testing-library/react';
import { Controlled } from 'react-codemirror2';
import CodeEditor from './index';

vi.mock('react-codemirror2', () => ({
  Controlled: vi.fn(() => null),
}));

beforeEach(() => {
  vi.mocked(Controlled).mockClear();
});

it('keeps non-primitive CodeMirror defaults stable across renders', () => {
  const { rerender } = render(<CodeEditor value="{}" />);
  const firstOptions = vi.mocked(Controlled).mock.calls.at(-1)[0].options;

  rerender(<CodeEditor value='{"updated": true}' />);
  const secondOptions = vi.mocked(Controlled).mock.calls.at(-1)[0].options;

  expect(secondOptions.extraKeys).toBe(firstOptions.extraKeys);
  expect(secondOptions.gutters).toBe(firstOptions.gutters);
});
