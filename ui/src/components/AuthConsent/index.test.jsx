import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthConsent from './index';

it('should render AuthConsent page', () => {
  const { asFragment } = render(
    <MemoryRouter keyLength={0}>
      <AuthConsent
        transactionID="transactionID"
        registeredClientId="registeredClientId"
        clientId="clientId"
        onExpirationChange={vi.fn()}
        onInputChange={vi.fn()}
        onScopesChange={vi.fn()}
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
