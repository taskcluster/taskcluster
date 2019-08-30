---
order: 11
title: AWS Provider Type
---

# AWS Provider Type

AWS-based providers create workers dynamically in the EC2 service.

## Worker Interaction

The provider starts workers with a JSON object in user-data containing the following properties:

* `workerPoolId` -- worker pool for this worker
* `rootUrl` -- root URL for the Taskcluster deployment
* `providerId` -- provider ID that started the worker
* `workerGroup` -- the worker's workerGroup (currently equal to the providerId, but do not depend on this)

The worker's `workerId` is identical to its instance ID, which the worker can retrieve from the AWS metadata service.

The worker should call `workerManager.registerWorker` with an `workerIdentityProof` containing properties

* `document` -- from `http://169.254.169.254/latest/dynamic/instance-identity/document`
* `signature` -- from `http://169.254.169.254/latest/dynamic/instance-identity/signature`

The `document` property is signed byte-for-byte by the `signature` property, so it must be passed along unchanged.

## Tags

The provider starts workers with Tags

 * `Name` - same as workerPoolId
 * `ManagedBy` - `taskcluster`
 * `CreatedBy` - `taskcluster-wm-<providerId>`
 * `Owner` - same as worker pool `owner` property

## Worker-Pool Configuration

Worker-pool configuration for a worker-pool using this provider type must match the following schema.

<SchemaTable schema="/schemas/worker-manager/v1/config-aws.json" />
