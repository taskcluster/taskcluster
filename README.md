# continuous-log-serve

## TODO
  - [x] byte range fetching
  - [x] aggregate pending writes into single buffer and/or multiple write
    then flush when no longer writing.
  - [ ] cli
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
