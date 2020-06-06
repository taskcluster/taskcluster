audience: deployers
level: minor
reference: issue 2877 
---
The `wmworkers_entities` table has now been migrated to use a relational table.
The new table is called `workers`. `wmworkers_entities` will get deleted.
