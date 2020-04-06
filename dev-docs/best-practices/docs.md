# Documentation Best Practices

Taskcluster's documentation is expansive, and is divided roughly according to audience.
In many cases, documentation changes for a single pull request or feature should occur in multiple places.

## Audience

Taskcluster's documentation serves several audiences:
<!-- NOTE: Please update dev-docs/best-practices/changelog.md and the changelog cli when updating this list -->

 * **Users** -- people creating tasks, consuming Taskcluster APIs, using the UI, and so on
 * **Administrators** -- people managing roles and scopes, creating hooks, and so on
 * **Deployers** -- people deploying the Taskcluster services and associated resources
 * **Worker Deployers** -- people deploying workers, worker images, and associated infrastructure
 * **Developers** -- people working on improvements to Taskcluster itself

## Web Docs

These are the docs available at `/docs` on any deployment, and centrally hosted at https://docs.taskcluster.net/docs.
There are several chapters in this documentation:

* Tutorial -- meant to be a gentle introduction to "what is this??", for beginning *users*
* Manual -- narrative, *user*-focused descriptions of how things work
* Reference -- authoritative documentation on how systems work, especially useful for *users* and *adminstrators*

The manual summarizes the information such users would need, including descriptions of conventions and suggestions for ways to use the service effectively.
Its audience is users with a problem to solve, such as "how do I make one task depend on another"?
The manual typically explains concepts broadly and then links to the reference chapter for details.

The reference chapter contains the authoritative, technical information a user needs to know to interact with various parts of Taskcluster.
Many parts of the reference documentation are automatically generated to ensure they are up to date.
The audience for this chapter is users and administrators at the implementation stage of their work and looking for precise, detailed information.

### Deployment-Docs

Deployment docs are located in a section of the manual chapter.
They are intended for *deployers* and *worker deployers* and cover topics such as:

* Running Taskcluster services
* Taskcluster service configuration
* Monitoring (logging, metrics, and error reporting)
* Debuggging advice

## Dev-Docs

Development docs are linked from the [README](../../README.md) at the top level of the Taskcluster Git repository.
They are intended for *developers*.
Developers would typically look to this documentation to answer questions like "how does this implementation work?" or "what's the right way to make this change?"

Developer documentation can be found at:

* [`/clients/*/README.md`](../../clients) - authoritative documentation for usage of the JS client libraries.
  This documentation is also available for users from the appropriate packaging hosts, such as [pypi](https://pypi.org/project/taskcluster/).

* [`/libraries/*/README.md`](../../libraries) - authoritative documentation for usage of the JS libraries shared by all TC services.

* [`/services/*/README.md`](../../services) - documentation for working on individual services.
  This is typically limited to advice for running tests, but [sometimes](../../services/worker-manager/providers.md) includes instructions for writing specific kinds of modules.

* [`/dev-docs`](../) - higher-level developer documentation that crosses boundaries between services and libraries

* [`/dev-docs/best-practices`](./) - guidelines we've agreed on for Taskcluster development, in an effort to keep the codebase consistent and permit developers to move easily throughout the codebase.

