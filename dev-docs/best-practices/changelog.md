# Changelog Entries

Changes that we want users to be aware of when updating should add a new snippet file in the `changelog/` directory.
This directory contains "snippets" that will be combined into the Changelog of the next release.

## Writing a Changelog

To write a changelog entry, use `yarn changelog`, giving the issue or bug if one exists, and a level.
For example:

```shell
yarn changelog --issue 1234 --minor --developers
```

## File Format

Filenames should end in `.md` but are otherwise arbitrary.
To avoid conflicts, it's generally easiest to use a bug or issue identifier, e.g., `1849342.md`.

Each file is a markdown file with the following format:

```
# (required) the semver level of this change, one of 'patch', 'minor', or 'major'
level: ..
# (required) the audience who this is applicable to, one of 'general', 'admins', 'deployers', 'users', or 'developers' (definied below)
audience: ..
# (optional) a reference to the bug or issue tracking this change ("bug xxxxxxx" or "issue xxx")
reference:  ...
---
<Snippet Text>
```

## Audiences

Taskcluster has several groups of people who interact with it. They are defined in
[the best practices docs about writing documentation](/dev-docs/best-practices/docs.md). Each changelog entry must be addressed to one of these groups
*or* if it is more widely applicable, give it a `general` audience. The value of the `audience` field for each audience is as follows:

| Audience         | Value              |
|------------------|--------------------|
| General          | `general`          |
| Users            | `users`            |
| Administrators   | `admins`           |
| Deployers        | `deployers`        |
| Worker Deployers | `worker-deployers` |
| Developers       | `developers`       |

## Levels

Every changelog snippet must specify a level.
These follow [semver](https://semver.org/), with the addition of "silent" changes that are like a patch, but not shown in the release notes.

A major change is one that breaks backward compatibility or could cause disruption for any of the audiences if not handled carefully.
Do not be afraid to flag a change as major -- users and operations staff will always prefer to be warned of an issue that does not apply to them, over being surprised by an issue that the developers did not anticipate.

A minor change is one that adds new functionality without breaking backward compatibility.
Typically this functionality is something that would motivate a user or operator to adopt the upgrade.
If the change is in response to a feature-request filed by a user, it is probably at least "minor".
Note that any database upgrade is considered at least minor, as rollback might incur data loss.

A patch change is one that fixes a bug or makes a minor change which users can do their work without.
A key distinction between minor and patch changes is that an operations engineer should be comfortable rolling back a patch upgrade immediately if any issues are uncovered.
If a change cannot be easily rolled back, it is not a patch change.

We want to avoid including *every* change in the release notes, as the length would be overwhelming and users would have difficulty finding the information that is important to them.
If any of these users would want to know about the change, the level should be at least "patch".
If the change is routine or a very minor fix, we regard the change as "silent".

For example:
 * major: Breaking changes for deployment of Taskcluster
 * major: Breaking changes for administration of Taskcluster
 * major: Breaking changes for users of Taskcluster
 * major: Any change that adds a DB version that may take more than a few seconds to run (with notes to the deployers as to how long)
 * minor: New feature users want to know about and take advantage of
 * minor: Any change that adds a new version to the database
 * patch: Bug fix users are waiting on
 * silent: Changes to tests or documentation
 * silent: Minor changes or fixes to UI
 * silent: Dependency changes
 * silent: Changes to developer infrastructure such as `yarn generate` or `yarn lint`
 * silent: Minor bugfixes where the bugs did not impact many users

## Snippet Text

In writing a changelog snippet, think of the perspective of the Taskcluster user who will be reading it.
They will want to know "what does this mean for me?"
Write it in the present tense, as if the change had just been deployed.

For example:

> Worker pools are now deleted by updating their `providerId` to `null-provider`.
> The `deleteWorkerPool` API method is no longer supported.

If a change fixes a bug, describe the circumstances where that bug would occur as completely as possible, and when the bug was introduced.
Users may want to determine whether the bug they are seeing is novel or will be fixed with this update:

> This release fixes a bug where a hook with an invalid pulse binding would cause bindings for all hooks to be reset repeatedly, potentially leading to delays triggering those hooks.
> This incorrect behavior was visible in the Hooks service's logs, but not visible to users.
> The bug was introduced in v11.4.0.

If the change is not user-visible, but would be important to someone deploying Taskcluster, write it for that audience:

> The web-server service now takes a single `JWT_KEY` configuration value
> containing an HMAC-SHA256 secret, replacing the earlier use of a
> public/private key pair.
