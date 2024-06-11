/**
 * Github `issue_comment` events handler
 *
 * .taskcluster.yml should have `allowComments: collaborators` in order for this to work
 *
 * sender needs to be a valid collaborator on the repository
 *
 * Supported comments are:
 * - `/taskcluster run-tests`
 * - `/taskcluster run-test-foo`
 * - `/taskcluster merge`
 **/
export async function issueComment(message) {
  // 1. check taskcluster.yml if policy is allowed
  // 2. check if sender is a collaborator
  // 3. check if the comment is a valid command
  // 4. execute the command
}

/*

TODO:
- [ ] add webhook listener for `issue_comment` events
- [ ] publish those to the queue
- [ ] activate this listener
..
profit
*/
