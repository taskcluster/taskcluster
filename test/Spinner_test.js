import React from 'react';
import Spinner from '../src/components/Spinner';

describe('<Spinner />', () => {
  it('should render correctly', () => {
    const spinner = mount(
      <Spinner loading />
    );

    expect(spinner).toMatchSnapshot();
  });
});
