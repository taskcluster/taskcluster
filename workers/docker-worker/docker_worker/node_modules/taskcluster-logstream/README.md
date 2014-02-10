taskcluster-logstream
=========

Taskcluster uses azure (over http) to store all of our logging data...
Generally this process uses standard http conventions + polling but we
also needed some way to indicate when the stream ends.

The readable stream interface provided does something like this:

 - issue a request to the given url (use range if offset is available and if-none-match conditionals if etag is available)
   - a. if its not in the 200 range retry in N ms
   - b. if its in the 200 range continue
   - c. if the request contains the 'x-ms-meta-complete' header mark
      stream as complete (end event).
 - record the byte offset
 - record the etag
 - emit data from server in the readable stream (data event)
 - repeat these steps in N ms.

## Usage

```js
var Reader = require('taskcluster-logstream');

var stream = new Reader('myazureurl.txt');
stream.pipe(process.stdout);
```
