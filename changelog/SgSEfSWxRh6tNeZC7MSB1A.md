audience: deployers
level: minor
---
Database version 11 removes the `widgets` table that was used to test Postgres deployment.  It contains no useful data.
The hidden `notify.updateWidgets` API method, but this method was never meant to be used so this removal is not considered a breaking change.
