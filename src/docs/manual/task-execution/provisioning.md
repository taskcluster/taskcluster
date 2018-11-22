---
filename: task-execution/provisioning.md
title: Provisioning
order: 40
---

In the simplest case, a worker implementation is installed and configured
manually on a host and executes tasks indefinitely. For most purposes, it is
far more cost-effective to dynamically adjust the pool of available workers
based on the work to be done. This process entails both provisioning new
instances (often referred to simply as "provisioning") and terminating running
instances (typically a function of the worker itself).

A provisioner operates by monitoring the pool of running workers and the
corresponding queues. Based on the queue length and the configuration of the
provisioner, it may create new workers or signal to running workers that they
should stop. Of course, provisioners might take into account additional
information to make better predictions of future load. A provisioner's
configuration can balance performance (many instances to execute tasks in
parallel) against cost (from idle workers).

## Provisioner IDs

Worker types are scoped within a `provisionerId`, allowing each provisioner its
own "namespace" of managed workers.

The current set of provisioner IDs is visible at
https://tools.taskcluster.net/provisioners.

## AWS Provisioner

The Taskcluster team provides a provisioner instance, running the AWS
Provisioner, which creates EC2 spot instances within the Taskcluster AWS
account.

It is identified as provisionerId `aws-provisioner-v1`. Its administrative
interface is available at https://tools.taskcluster.net/aws-provisioner/.  This
interface allows monitoring of current load, as well as management of worker
types.

The AWS provisioner only provisions new instances, relying on workers to
terminate themselves as appropriate. It does have a safety feature to forcibly
terminate instances that have been running for a long time, but that is
intended as a cost-saving measure for failed workers, rather than a part of
normal operation.

The worker types provided by the AWS provisioner are a mix: some are
Firefox-specific, while others are available for other Mozilla uses. Since the
service runs with the Taskcluster team's AWS credentials, all costs are borne
by the Taskcluster team.

If you are setting up a new worker type for this provisioner, it is your
responsibility to ensure that AMI, kernel, security groups, and so on are
properly defined. The AWS provisioner has some expectations of the instances it
starts:

 * a worker starts on boot;
 * that this worker understands the task payload; and
 * that the worker terminates when it can be considered no longer cost
   effective to keep running (e.g. after a certain period of inactivity,
   or a maximum uptime has elapsed)
