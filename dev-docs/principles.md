# Guiding Design Principles for Taskcluster

At the [2016 tc-worker workweek](http://www.chesnok.com/daily/2016/03/11/workweek-tc-worker-workweek-recap/) the Taskcluster Platform team laid out our _core design principles_. The four key principles are:

* Self-service
* Robustness
* Enable rapid change
* Community friendliness

## Getting Things Built™

These are all under an umbrella we call Getting Things Built&#8482;. None of our work matters unless __it works__! Read further for a slightly expanded list of principles!

### Self-service

- Task Isolation
- API-driven UI Tools
- Extensibility
- Granular Security
- Clearly-defined interfaces
- Separation of concerns

### Robustness

- Scalability
- Correctness
  - [Idempotent APIs](/dev-docs/idempotency.md)
- Minimal Self-hosting
  - Use managed services, e.g. S3, Azure Storage
  - Don't self-host mutable services
- Stateless services
- 12-factor applications

### Enable Rapid Change

- Agility
- Clearly-defined interfaces
- Microservices
- Separation of concerns

### Community Friendly

- Transparency
  - Granular Security
- Public by Default
- Self-Service
- Changes are made in an open fashion, considering all (real and potential) users of the platform
  - In particular, we strive to implement _general_ solutions even when a single user has a very _specific_ requirement.
    More precisely, despite Firefox CI being the dominant user of Taskcluster, implementations of features are never Firefox-specific.

## In Practice..

Here are a few bullet-point practical principles we follow in developing and reviewing changes to Taskcluster:

### Taskcluster Services

* *Services do not share code* - no service ever `require`s (or `imports`) code from another service.
  When necessary, common code is factored out into libraries (under `libraries/` and in packages named `taskcluster-lib-...`).

* *Services are tiered* - the "platform" services are interdependent and not expected to work without each other.
  For example, the queue service will fail if the auth service is down.
  The "core" and "integration" services depend on platform services, but the reverse is not the case.
  For example, the secrets service will fail if the queue service is down, but the queue service will continue running when the secrets service is down.

* *Services own their database tables* - each database table belongs to a single service, which has write access to that table
  In general, other services needing that data should prefer to get it via "normal" REST API calls.
  In limited cases where that data is required for database-level operations, a service can be granted read-only access to another service's tables.
  For example, as of this writing the worker-manager service can read the queue's `queue_workers` table to determine whether a worker is quarantined.
  Such cross-service data sharing should be minimal.

* *Database access has lots of rules* - special care is required around database design.
  Important user-facing features such as downtime-free upgrades depend on adherence to these rules.
  See the [@taskcluster/lib-postgres](../libraries/postgres) and [db](../db) documentation for details.
