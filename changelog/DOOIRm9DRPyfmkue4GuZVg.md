audience: users
level: major
---
`index.insertTask` now ensures that the rank is an integer that fits a postgres `Int4` (-2147483648 / 2147483647) instead of returning a 500 when the passed rank did not fit.

The generated clients now expect the rank passed to `index.insertTask` to be an integer instead of a float.
