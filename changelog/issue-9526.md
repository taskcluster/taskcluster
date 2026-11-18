audience: deployers
level: patch
reference: issue 9526
---
The Azure provider now removes a requested worker when its `registrationTimeout` passes while its ARM deployment is still in progress. Previously such workers stayed requested until Azure ended the deployment, which could take 40 minutes or more, and they blocked replacement workers. The provider also cancels the in-progress ARM deployment of any stopping worker, so its cleanup does not wait for Azure. This cancellation is not reported as a worker pool error.
