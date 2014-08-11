continuous-log-serve
====================

continuous log serve prototype in go...

## Goals:
  - Don't use up too much memory per log file (1-2mb) but don't block
    too freqently on IO.

  - Byte range fetching.

  - Read contents of entire stream from the begining.

  - The ability to redirect on finish of a log for some period of time based on
    a LRU cache.

  - Multiple clients an and will request the same log file these requests should
    be handled in a fashion which will not block other requests.


## V1 Strategy

