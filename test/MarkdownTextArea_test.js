import React from 'react';
import MarkdownTextArea from '../src/components/MarkdownTextArea';

describe('<MarkdownTextArea />', () => {
  it('should render correctly', () => {
    const text = '[Foo](Bar)';
    const markdownTextArea = shallow(
      <MarkdownTextArea value={text} />
    );

    expect(markdownTextArea).toMatchSnapshot();
  });
});
