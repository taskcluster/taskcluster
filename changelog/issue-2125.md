level: patch
reference: issue 2125
---
`Promise.all` in the graphql loaders wont reject the entire promise if an error is thrown.