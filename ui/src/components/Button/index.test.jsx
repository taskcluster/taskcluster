import React from 'react';
import { render } from '@testing-library/react';
import Button from './index';
import { AuthContext } from '../../utils/Auth';

it('should render Button', () => {
  const { asFragment } = render(
    <AuthContext.Provider value={{ user: { id: 'userId' } }}>
      <Button className="className" id="id" onClick={vi.fn()}>
        Icon
      </Button>
    </AuthContext.Provider>
  );

  expect(asFragment()).toMatchSnapshot();
});
