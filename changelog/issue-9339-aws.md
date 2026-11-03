audience: worker-deployers
level: minor
reference: issue 9339
---
The AWS provider now picks launch configurations by weight, like the Google and Azure providers, instead of splitting new instances evenly across them, and honors each launch configuration's `workerManager.maxCapacity`. Instance creation errors are now attributed to their launch configuration, and a capacity failure in one launch configuration no longer stops the others from launching instances in the same provisioning run.
