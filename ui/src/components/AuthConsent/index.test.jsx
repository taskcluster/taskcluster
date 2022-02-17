import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthConsent from './index';

jest.useFakeTimers('modern').setSystemTime(new Date('2022-02-20').getTime());

it('should render AuthConsent page', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <AuthConsent
        transactionID="transactionID"
        registeredClientId="registeredClientId"
        clientId="clientId"
        onExpirationChange={jest.fn()}
        onInputChange={jest.fn()}
        onScopesChange={jest.fn()}
        formData={{
          expires: new Date('2022-02-02'),
          description: 'description',
          scopes: ['scopes'],
        }}
      />
    </MemoryRouter>
  );

  expect(asFragment()).toMatchSnapshot();
});
