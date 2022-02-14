// ***********************************************
// commands documentation:
// https://on.cypress.io/custom-commands
// ***********************************************

Cypress.Commands.add('login', () => {
  cy.visit(Cypress.env('TASKCLUSTER_ROOT_URL'))
  cy.contains('button', 'Sign in').click()
  cy.contains('Sign in with credentials').click()
  cy.get('input[name=clientId]').type(Cypress.env('TASKCLUSTER_CLIENT_ID'))
  cy.get('input[name=accessToken]').type(Cypress.env('TASKCLUSTER_ACCESS_TOKEN'))
  cy.get('button[type=submit]').click()
})

Cypress.Commands.add('logout', () => {
  cy.get('#user-menu-button').click()
  cy.contains('Sign Out')
  cy.get('#user-menu-sign-out').click()
})
