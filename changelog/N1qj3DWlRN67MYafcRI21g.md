level: major
---
Support for several deprecated services has been removed.
* The login service has been removed from the codebase and from all client libraries.  It was retired on November 9, 2019 when the external services that depended on it migrated to third-party login support.  It was never part of the Helm deployment.
* Support for the deprecated ec2-manager and aws-provisioner services has been removed from all client libraries.  These services are no longer running, so this should have minimal impact.
* Support for the long-removed events service and the never-released gce-provisioner service has been removed from the Go client.
