# Mock Services Design

This package contains mock service implementations for worker tests.

Design goals:

1) All tests runnable against mocks _or_ a real deployed cluster
2) Tests to run against mocks by default, but configurable to run against a
   real taskcluster deployment
3) Mocks to service HTTP requests on localhost, emulating a real worker
   environment, in order to maximise test coverage of worker code
4) All worker required network services to be mocked, including AWS S3 upload
   (for artifact publishing), cloud metadata endpoints and taskcluster HTTP
   endpoints
5) Tests requiring external conditions hard to trigger in a real deployment
   may bypass requirement for compatibility with a real taskcluster deployment

At the current time, the following are _NOT_ design goals, due to the increased
complexity to implement. These may become design goals in the future.

1) Mock services to be usable by both generic-worker and docker-worker tests
2) Sharable tests between generic-worker and docker-worker
