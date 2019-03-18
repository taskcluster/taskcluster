---
title: Guidelines
order: 5
---

# Guidelines

Before jumping in to the technical details, a few words of caution are required
regarding integrating with Taskcluster, especially with user-provided
credentials.

## Careful with Credentials

When a user clicks "Grant" for your service, they are trusting your service
with their credentials.  For some users, those credentials are very powerful.

Limit the places you copy Taskcluster credentials (or the access_tokens that
lead to them):

 * Do not send them to your backend, if possible.
 * Do not log them
 * Redirect, or rewrite `window.location`, to remove them from the browser's
   location bar when they appear in a URL.

## ClientIds

*Do not* use `clientId`s for authentication.  While clientIds do have a
consistent structure, we do not guarantee that structure will remain, and
nothing in the clientId is an assertion of identity.

It is OK to display a clientId to the user, although in most cases the
information returned from the OIDC provider (Auth0) is more appropriate.

## Scopes

For a backend application using Taskcluster authentication, the information you
may rely on for authorization is contained in the list of scopes returned from
the
[`auth.authenticateHawk`](/docs/reference/platform/auth/reference/api-docs#authenticateHawk)
method.

The only valid operation on a scopeset is to ask whether it satisfies another
scopeset. Do not try to interpret scopes directly.  For exmaple, to determine
if a user has access to a GitHub repository, first determine the repository,
then check whether the user's scopes satisfy
`['assume:repo:github.com/owner/repo:branch:master']`. Do not filter the
scopeset for strings beginning with `assume:repo`.

## Certificates

Some kinds of Taskcluster credentials include a `certificate` which looks like
JSON. Resist the temptation to parse this JSON, as its format may change
without warning and it may (likely will) be removed altogether at some point.

Design your application to work equally well with Taskcluster credentials of
form `{clientId, accessToken}` or `{clientId, accessToken, certificate}`.

## Acting on Behalf of a User

If the service you are building acts on behalf of users, but uses its own
Taskcluster credentials (for example, on the backend, to avoid storing users'
credentials), you must be very careful to avoid allowing malicious users to
abuse your privileges through scope escalation.  Scope escalation is when a
user can cause some action for which they do not have the appropriate scopes.

For example, your service might create tasks based on a user's selections in a
browser form.  If the service has the scopes to create tasks that can read
secrets, but does not verify that the user has such permission, then the
service would provide a way for malicious users to create tasks that display
those secrets.  Then the user has escalated their access to include those scopes
which they did not already possess.

This is a [Confused
Deputy](https://en.wikipedia.org/wiki/Confused_deputy_problem) attack.  The
phrase "confused deputy" refers to the case where a service performs some
actions on a user's behalf (as a deputy), but allows scope escalation
(confused).

### Don't be a Deputy

The best way to avoid this issue is to not act as a deputy.  This means using
the user's own Taskcluster credentials to create the tasks, rather than using
credentials assigned to the service.  In the example above, ideally the user's
credentials would be stored locally in the browser, and the client-side code
would call the queue's `createTask` method directly.

### Deputy Tools

If you must act as a deputy -- for example, running tasks without a browser
involved -- Taskcluster provides a tool, [Authorized
Scopes](authorized-scopes). Authorized scopes are used with an API call to
reduce the scopes available to that call. 

For example, a service which creates tasks during low-load times might have a
`createDelayedTask` API method taking a time and a task definition.

The obvious, but incorrect, way to authenticate this would be to duplicate the
`queue.createTask` permissions model, verifying the caller possess the scopes
in `task.scopes`.  When the system load fell and it was time to run the task,
the service would call `queue.createTask` using its own credentials.  But there
are already some subtleties in queue's permissions model, and that model may
change over time, introducing a scope-escalation vulnerability.

The better answer is to capture the scopes of the credentials used to call
`createDelayedTask`.  When calling `queue.createTask`, pass those scopes as
`authorizedScopes`.  This method avoids any interpretation of scopes by the
delayed-task service, so there is no possibility of a scope escalation.

This better answer does lose the advantage of error-checking:
`createDelayedTask` will happily accept a task for which the user does not have
scopes, but will fail when the service calls `queue.createTask`.  It's safe to
fix this with an approximation to the queue permissions model, as long as the
`authorizedScopes` are still enforced.  The failure modes for this check are
acceptable: either `createDelayedTask` refuses to create a delayed task which
should be accepted, or it accepts a task which will later fail due to the
`authorizedScopes`.

