---
filename: index.md
title: Taskcluster Manual
---

What does Taskcluster do?

Fundamentally, it executes *tasks*. A task is defined in a JSON object, and
placed on a *queue*. A *worker* later claims that task, executes it, and
updates the task with the results.

## The Taskcluster Service and Team

We provide Taskcluster as a service, rather than as an installable application.
The service is constructed as a collection of loosely-coupled microservices.
These microservices share many characteristics, making it easy to use them
together.

Taskcluster aims to be a general platform for task execution to support
software development within the Mozilla organization. It is very much a work
in progress. The current focus is to support Firefox development, without
losing the generality that will make it useful for other Mozilla projects.

Taskcluster is designed to integrate well with other services and components.
Some of those integrations are Mozilla-specific (for example, Treeherder),
while others are not. Some integrations are maintained and provided by the
Taskcluster team, such as AWS compute resources. Others are managed separately,
and may not be available to all users -- including the compute resources
assigned to Firefox development.

## Working with Taskcluster

Most people do not need to understand everything about Taskcluster! The
[Taskcluster Tutorial](/docs/tutorial) is designed to lead you to the information
that is most relevant to you.

The [reference section](/docs/reference) contains documentation about the
Taskcluster services and libraries. Once you have determined the services you
need to interface with, this section can provide all of the technical detail
you need to do so successfully.  The reference section begins with a [guide to
the microservices](/docs/reference/guide) that can help to determine the services
most relevant to your work.

The remainder of the manual describes the Taskcluster platform in depth.  The
[Tasks chapter](/docs/manual/tasks) describes the concept around which the system
revolves -- tasks.  The [Task Execution chapter](/docs/manual/task-execution)
describes how these tasks are executed.  The next chapter, [System
Design](/docs/manual/system-design), provides the details you will need to interact
with Taskcluster. Finally, [Using Taskcluster](/docs/manual/using) presents a
collection of common use cases and approaches to satisfy them.
