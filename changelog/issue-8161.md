audience: worker-deployers
level: minor
reference: issue 8161
---

Estimator no longer includes `stoppingCapacity` to calculate how many workers needs to be created.
This is no longer necessary since Azure started using ARM templates for deployment, which are no longer blocked
by the worker scanner that had to provision and deprovision resources at the same time.
