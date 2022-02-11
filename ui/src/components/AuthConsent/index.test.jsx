import React from 'react';
import { shallow } from 'enzyme';
import { MemoryRouter } from 'react-router-dom';
import AuthConsent from './index';

it('should render AuthConsent page', () => {
  const cmp = shallow(
    <MemoryRouter keyLength={0}>
      <AuthConsent
        transactionID="transactionID"
        registeredClientId="registeredClientId"
        clientId="clientId"
        onExpirationChange={jest.fn()}
        onInputChange={jest.fn()}
        onScopesChange={jest.fn()}
        formData={{
          expires: new Date('2022-02-02T12:00:00.000Z'),
          description: 'description',
          scopes: ['scopes'],
        }}
      />
    </MemoryRouter>
  );

  expect(cmp).toBeDefined();
  expect(cmp.html()).toContain('input');
  expect(cmp).toMatchSnapshot();
});
