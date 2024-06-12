audience: developers
level: minor
reference: issue 5073
---

Github service supports `issue_comment` events to trigger jobs through `/tasckluster param` comments in open Pull Requests.
`.taskcluster.yml` in default branch should allow this with `allowComments: collaborators` value.
Tasks would be rendered with `tasks_for = "issue_comment"` and `event.taskcluster_comment = param`
