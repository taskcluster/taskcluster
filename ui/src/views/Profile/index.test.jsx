import React from 'react'
import { shallow } from 'enzyme'

import Profile from './index'
import { ApolloProvider } from 'react-apollo'
import setupClient from 'apollo-client-mock'

const typeDefs = `
  type User {
    id: ID!
  }
`

import { Router } from 'react-router-dom'
import { createMemoryHistory } from 'history'

const history = createMemoryHistory({})

it('should render Profile page', () => {
  const createClient = setupClient({}, typeDefs)
  const cmp = shallow(<Router history={history}><ApolloProvider client={createClient()}><Profile /></ApolloProvider></Router>)

  expect(cmp).toBeDefined()
  expect(cmp).toMatchSnapshot()
  // TBD: test for the content
})