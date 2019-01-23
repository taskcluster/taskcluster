---
filename: design/apis/reference-format.md
title: Reference Formats
order: 40
---

Most Taskcluster services make heavy use of JSON schemas for validation of
incoming and outgoing data, whether through APIs or AMQP exchanges. This makes
the external API surface very reliable and consistent, and helps avoid a lot of
bugs and typos.

The use of JSON schemas also makes it very easy to **generate documentation**
for all the external interfaces offered by Taskcluster components, as done on
this site. To further simplify the generation of documentation and API-clients
we have formalized formats for describing interfaces.

This document describes the formats in which references for API end-points and
AMQP exchanges are documented. This is useful for **automatic generation** of:

 * Documentation
 * Client libraries
 * Dummy mock servers

## Reference Manifest

All services are linked in a reference manifest, available at
`/references/manifest.json`.  The file contains links to API references
(`api.json`) and to exchange references (`exchanges.json`).

The schema for this manifest is as follows:

<div data-render-schema="taskcluster:/schemas/common/manifest-v2.json">
</div>

## API References

Taskcluster API calls are REST-like HTTP transactions, and the API reference
describes how to formulate a request and what to expect in the response.  This
includes an HTTP method, a route, and (for calls with a request body) an input
schema.

The route includes some parameters where user data (such as a `taskId`) can be
substituted.  The request URL is formed from the Taskcluster rootUrl, the
service name, the API version, and the post-substitution route.
[Taskcluster-lib-urls](https://github.com/taskcluster/taskcluster-lib-urls)
provides an `api` method to perform this operation.

An API end-point can take a JSON entity body as input and return a JSON entity
body, both of which are governed by a schema. Input is always validated by the
server before it is accepted, and output is validated before it is returned.
Note that clients should not re-validate output against the declared schema, as
server responses may change by adding additional properties.

The API reference format has the following format:

<div data-render-schema="taskcluster:/schemas/common/api-reference-v0.json">
</div>

## AMQP Exchange References

Each service which sends Pulse messages has its exchanges and messages defined
in a reference document with the following format.

<div data-render-schema="taskcluster:/schemas/common/exchanges-reference-v0.json">
</div>

Messages are validated on the server prior to publication.
Note that clients should not validate received messages against the declared
schema, as messages may change by adding additional properties.

## Taskcluster-References

The
[taskcluster-references](https://github.com/taskcluster/taskcluster-references)
service handles collating and serving references and schemas, and also holds
the authoritative copy of the schemas linked above.

When these schemas must be modified, new versions will be added, thus changing
the `$schema` URI in the documents. The schemas at the existing URIs will not
change.
