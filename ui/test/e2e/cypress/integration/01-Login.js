
describe('Taskcluster smoke test', () => {
  xit('should login', () => {
    cy.visit(Cypress.env('TASKCLUSTER_ROOT_URL'))
    cy.contains('Stage-TC')

    cy.login()

    cy.contains(Cypress.env('TASKCLUSTER_CLIENT_ID'))
  })

  xit('should contain menu items', () => {
    cy.get('.MuiIconButton-colorInherit > .MuiIconButton-label > .mdi-icon').click()
    cy.contains('Create task')
    cy.contains('View Task')
    cy.contains('Task Groups')
    cy.contains('Task Index')
  })

  it('should create a task', () => {
    cy.login()
    cy.get('.MuiIconButton-colorInherit > .MuiIconButton-label > .mdi-icon').click()
    cy.contains('Create task').click()

    cy.contains('proj-getting-started/tutorial')
    cy.contains('example-task')
    cy.get(':nth-child(1) > .CodeMirror-line > [role="presentation"]').click()

  })
})
