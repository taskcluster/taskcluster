import { render } from '@testing-library/react';
import { AuthContext } from '../../utils/Auth';
import Button from './index';

it('should render Button', () => {
  const { asFragment } = render(
    <AuthContext.Provider value={{ user: { id: 'userId' } }}>
      <Button className="className" id="id" onClick={jest.fn()}>
        Icon
      </Button>
    </AuthContext.Provider>,
  );

  expect(asFragment()).toMatchSnapshot();
});
