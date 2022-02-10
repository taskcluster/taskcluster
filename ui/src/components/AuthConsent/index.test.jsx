import React from 'react'
import { shallow } from 'enzyme'

import AuthConsent from './index'

import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'
const history = createMemoryHistory({})

it('should render AuthConsent page', () => {
  const cmp = shallow(<Router history={history}>
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
  </Router>)

  expect(cmp).toBeDefined()
  expect(cmp.html()).toContain('input')
  expect(cmp).toMatchSnapshot()
})