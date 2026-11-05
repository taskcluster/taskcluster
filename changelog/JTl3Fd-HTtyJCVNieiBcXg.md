audience: users
level: major
---
The index rank returned by `index.findTask`, `index.insertTask`, `index.findTasksAtIndex`, `index.listTasks` and `index.listTasksPost` is now an integer. The generated Go client now returns it as an `int64` instead of a `float64`.
