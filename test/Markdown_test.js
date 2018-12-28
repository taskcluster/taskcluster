import React from 'react';
import Markdown from '../src/components/Markdown';

describe('<Markdown />', () => {
  it('should render correctly', () => {
    const text = '[Foo](Bar)';
    const markdown = mount(
      <Markdown>{text}</Markdown>
    );

    expect(markdown).toMatchSnapshot();
  });
});
