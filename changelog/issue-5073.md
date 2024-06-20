audience: developers
level: minor
reference: issue 5073
---

Github service supports `issue_comment` events to trigger jobs through `/tasckluster param` comments in open Pull Requests.
`.taskcluster.yml` in default branch should allow this with `policy.allowComments: collaborators` value.
Tasks would be rendered with `tasks_for = "github-issue-comment"` and `event.taskcluster_comment = param`
This is an implementation of [RFC 168](https://github.com/taskcluster/taskcluster-rfcs/blob/main/rfcs/0168-Trigger-Tests-Based-on-PR-Comments.md)
