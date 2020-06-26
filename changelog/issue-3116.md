audience: deployers
level: patch
reference: issue 3116
---
The db upgrade and downgrade scripts now verify that the default database collation is `en_US.UTF8`.  No other collation is allowed.
Unfortunately, changing the default collation requires dumping and re-creating the database.
