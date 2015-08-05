# livelog
<img hspace="20" align="left" src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://travis-ci.org/taskcluster/livelog.svg?branch=master)](http://travis-ci.org/taskcluster/livelog)
[![GoDoc](https://godoc.org/github.com/taskcluster/livelog?status.svg)](https://godoc.org/github.com/taskcluster/livelog)
[![Coverage Status](https://coveralls.io/repos/taskcluster/livelog/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/livelog?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

## TODO
  - [x] byte range fetching
  - [x] aggregate pending writes into single buffer and/or multiple write
    then flush when no longer writing.
  - [ ] cli
  - [x] cross domain headers
  - [x] http api

## Performance

Under heavy load while memory does not massively explode it does spike
and due to how go returns memory to the OS the memory will stay at that
level for up to 5 minutes. The best case situation is a low number of
clients (or no clients) who stream from beginning to end [this should be
uncommon]. For the more likely case (burst usage) the server is fairly
aggressive about closing connections with large amounts of pending data.
This means that the server can handle massive load and deliver some
amount of writes but drop other clients as needed in a mostly
first-come-first-server fashion (really also depends on how fast clients
can read from the socket).

## Tests

Tests are written in Node.JS largely because I wanted to write some
quickly and node has a great/easy interface to do the nonblocking
http stuff I wanted.

Usage:
```sh
npm install
npm test
```

## Configuration
The following environment variables can be used to configure the server.

 * `ACCESS_TOKEN` secret access token required for access (**required**)
 * `SERVER_CRT_FILE` path to SSL certificate file (optional)
 * `SERVER_KEY_FILE` path to SSL private key file (optional)
