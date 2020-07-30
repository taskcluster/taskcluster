audience: deployers
level: major
reference: issue 2937
---
Github checks are now stored in a table called `github_checks`, and github integrations are now stored in a table called `github_integrations`.  Both are accessed directly, rather than via taskcluster-lib-entities.  This migration takes about 10 seconds for a million-row table.
