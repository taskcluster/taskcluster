import React from 'react';
import Code from '../src/components/Code';

describe('<Code />', () => {
  it('should render correctly', () => {
    const text = JSON.stringify({ foo: 'bar' });
    const code = mount(
      <Code language="json">{text}</Code>
    );

    expect(code).toMatchSnapshot();
  });
});
