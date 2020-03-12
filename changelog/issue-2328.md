level: major
reference: issue 2328
---
This version adds a temporary "widgets" API method to the notify service.  This is intended to allow testing of the deployment process for Taskcluster services' backend database, and not for tracking of actual widgets.

This new API requires that Helm properties `notify.read_db_url` and `notify.write_db_url` be set correctly as documented in the [deployment documentation](https://docs.taskcluster.net/docs/manual/deploying/database).
