level: major
audience: users
reference: bug 2070520
---
`index.insertTask` will now reject an `expires` that is in the past, a
`taskId` that does not resolve to a task, and will silently cap the index
expiry to the task's own expiry.
