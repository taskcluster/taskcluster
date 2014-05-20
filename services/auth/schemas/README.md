Task Cluster JSON Schemas
=========================

In order to substitute in commonly used constants, but have different
descriptions, and still ensure that it is easy to maintain consistent schemas,
we have introduce an extra syntax `{"$const": "<key>"}`. These objects will
be replaced with values from `constants.js` when schemas a rendered.

For details on how to render the schemas and get the actual raw JSON schemas,
see taskcluster-base.
