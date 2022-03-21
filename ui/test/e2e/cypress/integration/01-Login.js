
describe('Taskcluster smoke test', () => {
  it('should login', () => {
    cy.visit(Cypress.env('TASKCLUSTER_ROOT_URL'))
    cy.contains('Stage-TC') // TODO: shouldn't be hardcoded

    cy.login()
    cy.contains(Cypress.env('TASKCLUSTER_CLIENT_ID'))
    cy.logout()
  })

  it('should contain menu items', () => {
    cy.visit(Cypress.env('TASKCLUSTER_ROOT_URL'))
    cy.get('#toggle-drawer').click()
    cy.contains('Create task')
    cy.contains('View Task')
    cy.contains('Task Groups')
    cy.contains('Task Index')
  })

  it('should create a task', () => {
    cy.login()

    cy.get('#toggle-drawer').click()
    cy.get('#sidebar-menu').contains('Create task').click()

    cy.contains('proj-getting-started/tutorial')
    cy.contains('example-task')
    cy.get(':nth-child(1) > .CodeMirror-line > [role="presentation"]').click()

    cy.logout()
  })
})
