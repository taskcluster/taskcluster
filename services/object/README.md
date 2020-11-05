# Object Service

The object service provides storage for large blobs of data.

## Backends

This service supports pluggable backends, as defined in the service configuration.
Each backend has its own configuration and specifies a backend type, which corresponds to an implementation in `src/backends`.

Each object is assigned a backend when it is created.

The base class for backends, in `src/backends/base.js`, is authoritative for the methods and behaviors that a backend must display.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-object test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.
