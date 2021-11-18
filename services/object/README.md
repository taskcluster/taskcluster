# Object Service

The object service provides storage for large blobs of data.

## Backends

This service supports pluggable backends, as defined in the service configuration.
Each backend has its own configuration and specifies a backend type, which corresponds to an implementation in `src/backends`.

Each object is assigned a backend when it is created.

The base class for backends, in `src/backends/base.js`, is authoritative for the methods and behaviors that a backend must display.

## Download Middleware

Within this service, "middleware" modules can inspect and modify requests and responses for calls to the download API.
The most common use of this support is to redirect simple downloads of public objects to a CDN.

Middleware is defined in `src/middleware` and middleware implementations inherit from `src/backends/base.js`.
The capabilities of middleware are fairly limited, but can easily be expanded as necessary.

## UploadId

Upload API methods should be idempotent, in case some transient error causes an issue.
That is, automatic client retries of an upload call should not fail if the first call partially completed.
To achieve this, callers pass an `uploadId` known only to that caller.
If that ID matches a previously-recorded call to the method, then the call silently succeeds.

Once an object is completely uploaded, its `uploadId` is cleared, signalling that the object can be downloaded.
Until this time, download requests for the object are rejected.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-object test` to run the tests.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.
