# mozilla-treeherder [![Build Status](https://travis-ci.org/lightsofapollo/treeherder-node.png?branch=master)](https://travis-ci.org/lightsofapollo/treeherder-node)

NodeJS interface for [treeherder](treeherder-dev.allizom.org).

## Usage

```js
var Project = require('mozilla-treeherder/project');

// this configuration can be aquired from an ateam member working on
// treeherder (jeads).
var project = new Project('gaia', {
  consumerKey: '...',
  consumerSecret: ''
});
```

## CLI

See all the options with:

```sh
./bin/treeherder --help
```

## Reporting Treeherder bugs

[treeherder](https://github.com/mozilla/treeherder-service) api errors will
include a traceback from the server. Most times these errors are simply
something you did wrong (no oauth credentials, wrong parameters, etc...)
but there are times when there are actually bugs in treeherder... Submit
an [issue](https://github.com/mozilla/treeherder-service/issues) with the traceback.

Example error message (send as a promise rejection usually)

```
     treeherder-error: [GET /api/project/gaia/jobs/ 500] [Errno 5] Input/output error

     Treeherder traceback:
       Traceback (most recent call last):
         File "/home/vagrant/treeherder-service/treeherder/webapp/api/views.py", line 126, in use_jobs_model
           return model_func(*args, jm=jm, **kwargs)
         File "/home/vagrant/treeherder-service/treeherder/webapp/api/views.py", line 320, in list
           objs = jm.get_job_list(offset, count, full, filter.conditions)
         File "/home/vagrant/treeherder-service/treeherder/model/derived/jobs.py", line 154, in get_job_list
           debug_show=self.DEBUG,
         File "/home/vagrant/treeherder-service/vendor/datasource/bases/RDBSHub.py", line 71, in wrapper
           return func(self, **kwargs)
         File "/home/vagrant/treeherder-service/vendor/datasource/bases/SQLHub.py", line 136, in execute
           return self.__execute(sql, kwargs)
         File "/home/vagrant/treeherder-service/vendor/datasource/bases/SQLHub.py", line 298, in __execute
           tmsg)
         File "/home/vagrant/treeherder-service/vendor/datasource/bases/RDBSHub.py", line 436, in show_debug
           sys.stdout.write( unicode(msg).encode("utf-8") )
       IOError: [Errno 5] Input/output error
```

## Tests

(you must run npm install first)

```sh
// run all the tests
npm test

// run one test
./node_modules/.bin/mocha path_to_test.js
```

Tests use nock so we can test some of our logic on CI without hitting
real servers but they are also designed to work with nock disabled... To
test against real servers do this:

```sh
// XXX: Testing this way is potentially buggy use at your own risk...
NOCK_OFF=true ./node_modules/.bin/mocha path_to_test
```

## Notes

  - `TREEHERDER_URL` environment variable can be used to configure the
     base url for treeherder.

