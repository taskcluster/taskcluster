audience: admins
level: patch
reference: bug 2057491
---
Fixed a bug in the auth service's scope resolver where the scopes `:*`, `::*`,
`:a*`, `:as*`, `:ass*`, `:assu*`, `:assum*` and `:assume*` were expanded as if
they were `*`
