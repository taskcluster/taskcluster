audience: worker-deployers
level: major
reference: issue 7147
---
**Breaking changes:**
- The Generic Worker configuration properties `deploymentId` and `checkForNewDeploymentEverySecs` are no longer supported and must not be used
- Generic Worker exit code 70 now indicates "Worker Manager advised termination" instead of "non-current deployment ID"

**New features:**
- New experimental `shouldWorkerTerminate` API endpoint in Worker Manager allows workers running with worker runner (`--with-worker-runner`) to query whether they should terminate
- New scope `worker-manager:should-worker-terminate:<workerPoolId>/<workerGroup>/<workerId>` required to call this endpoint
