import React from 'react';
import Label from '../src/components/Label';

describe('<Label />', () => {
  it('should render correctly', () => {
    const text = 'Foo';
    const label = mount(
      <Label status="default">{text}</Label>
    );

    expect(label).toMatchSnapshot();
  });
});
