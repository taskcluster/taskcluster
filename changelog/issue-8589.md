level: silent
reference: issue 8589
---
Add ESLint rule (`no-restricted-syntax`) banning the offset-paginated full-set scan loop pattern (`let offset = 0; while (...) { ... db.fns.X(.., offset); offset += N }`) that was the root cause of #8586 / #8587 / #8588. New code that reaches for this pattern is now flagged at lint time, with the message pointing at `paginatedIterator` from `@taskcluster/lib-postgres` as the correct keyset alternative.
