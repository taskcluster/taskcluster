// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --

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


//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
