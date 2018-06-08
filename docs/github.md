# Taskcluster GitHub API Documentation

##

The github service, typically available at
`github.taskcluster.net`, is responsible for publishing pulse
messages in response to GitHub events.

This document describes the API end-point for consuming GitHub
web hooks, as well as some useful consumer APIs.

When Github forbids an action, this service returns an HTTP 403
with code ForbiddenByGithub.

## Github Client

```js
// Create Github client instance:

const github = new taskcluster.Github(options);
```

## Methods in Github Client

```js
// github.ping :: () -> Promise Nothing
github.ping()
```

```js
// github.githubWebHookConsumer :: () -> Promise Nothing
github.githubWebHookConsumer()
```

```js
// github.builds :: [options] -> Promise Result
github.builds()
github.builds(options)
```

```js
// github.badge :: (owner -> repo -> branch) -> Promise Nothing
github.badge(owner, repo, branch)
```

```js
// github.repository :: (owner -> repo) -> Promise Result
github.repository(owner, repo)
```

```js
// github.latest :: (owner -> repo -> branch) -> Promise Nothing
github.latest(owner, repo, branch)
```

```js
// github.createStatus :: (owner -> repo -> sha -> payload) -> Promise Nothing
github.createStatus(owner, repo, sha, payload)
```

```js
// github.createComment :: (owner -> repo -> number -> payload) -> Promise Nothing
github.createComment(owner, repo, number, payload)
```

