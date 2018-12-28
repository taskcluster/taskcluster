import React from 'react';
import ErrorPanel from '../src/components/ErrorPanel';

describe('<ErrorPanel />', () => {
  it('should render correctly', () => {
    const text = 'Foo';
    const errorPanel = mount(
      <ErrorPanel error={text} />
    );

    expect(errorPanel).toMatchSnapshot();
  });
});

