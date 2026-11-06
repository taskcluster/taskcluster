audience: users
level: major
---
`queue.createTask` now rejects tasks with an `index.*` route whose `extra.index` contains values the index service would reject, silently skip indexing. `rank` must be an integer fitting in a postgres `int4`, `expires` must be a date in the future, `data` must be an object.
