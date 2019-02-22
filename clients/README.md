# Clients

This directory contains client libraries - libraries that can be used to call
Taskcluster APIs.

Client libraries are published to package repositories.

## Publishing

You must publish each client individually:

```
cd <client>
yarn
npm version <major|minor|patch>
npm publish
```
