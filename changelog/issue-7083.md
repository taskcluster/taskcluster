audience: users
level: patch
reference: issue 7083
---

Fixes query validation in pagination queries that were throwing `500 InternalServerError` instead of `400 InputError`
