import React from 'react';
import CodeEditor from '../src/components/CodeEditor';

describe('<CodeEditor />', () => {
  it('should render correctly', () => {
    const text = JSON.stringify({ foo: 'bar' });
    const codeEditor = shallow(
      <CodeEditor value={text} />
    );

    expect(codeEditor).toMatchSnapshot();
  });
});
