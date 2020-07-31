# AZQueue Library

This library partially implements the Azure Queue API, using Postgres.  It
implements enough of the API to support the use of Azure Queues by the
Taskcluster Queue service.  Behavior of the API conforms to the [Azure
Documentatation](https://docs.microsoft.com/en-us/rest/api/storageservices/queue-service-rest-api).
The details of the API conform to those of the
[fast-azure-storage](https://taskcluster.github.io/fast-azure-storage/classes/Queue.html)
library.  This library is a temporary shim to assist with migration to a native Postgres backend.

## Usage

```javascript
const AZQueue = require('taskcluster-lib-azqueue');

const db = await Database.setup(...);
const azqueue = new AZQueue({ db });

// there's no need to create or delete queues, so these are all no-ops
await azqueue.createQueue(queueName); // no-op
await azqueue.deleteQueue(queueName); // no-op
await azqueue.listQueues();  // (returns an emtpy list of queues)

// queue metadata is not tracked
await azqueue.setMetadata(queueName, metadata); // no-op
const  { messageCount } = await azqueue.getMetadata(queueName); // only returns count

// put a message in a queue
await azqueue.putMessage(
    queueName,
    messageText, // utf8 string
    {
        visibilityTimeout: 10, // in seconds
        messageTTL: 100, // in seconds
    });

// get messages from a queue.  If there are no messages, this immediately returns an
// empty list.  Poll this function (gently!).
const messages = await azqueue.getMessages(
    queueName,
    {
        visibilityTimeout: 10, // in seconds
        numberOfMessages: 1,
    });
// -> [{messageText, messageId, popReceipt}, ..]

// delete a message from a queue
await azqueue.getMessages(
    queueName,
    messageId,
    popReceipt);

// Delete all expired messages in all queues.  This is a maintenance task that
// should run about once an hour on a busy system.
await azqueue.deleteExpiredMessages();
```

## Backend

There are a few key things to know about how this uses postgres:

* It uses short-term locks, via `SELECT .. FOR UPDATE`, to ensure that only one
  transaction "gets" a single message.  The transaction marks the messages as
  "gotten" by updating its visibility, so this lock lasts only until
  `getMessages` returns, not until the message is ultimately handled.

* It allows concurrent gets with `.. SKIP LOCKED`, meaning that multiple
  concurrent transactions will look at different rows, rather than simply
  waiting for one another.

* It uses an index over (queue name, inserted timestamp) to limit `getMessages`
  attention to messages in a single queue, and prioritizes those that were
  inserted earliest, corresponding to FIFO order.  This can get a bit slow in
  cases where most of the earliest messages are invisible or expired.
