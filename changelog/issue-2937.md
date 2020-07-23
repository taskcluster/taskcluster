audience: deployers
level: minor
reference: issue 2937
---
Github builds are now stored in a table called `github_builds`, and accessed directly rather than via taskcluster-lib-entities.  This migration can process at least 40,000 rows in no more than a few seconds.  For a table larger than that, deleting the table contents before running the migration is an option.  This table backs the "status" and "badge" endpoints, so missing data is of minor consequence.
