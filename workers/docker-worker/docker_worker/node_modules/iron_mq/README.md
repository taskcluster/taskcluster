IronMQ Node.js Client
-------------

The [full API documentation is here](http://dev.iron.io/mq/reference/api/) and this client tries to stick to the API as
much as possible so if you see an option in the API docs, you can use it in the methods below.


## Getting Started

1\. Install the gem:

```
npm install iron_mq
```

2\. [Setup your Iron.io credentials](http://dev.iron.io/mq/reference/configuration/)

3\. Create an IronMQ Client object:

```javascript
var iron_mq = require('iron_mq');
var imq = new iron_mq.Client();
```

Or pass in credentials:

```javascript
var imq = new iron_mq.Client({token: "MY_TOKEN", project_id: "MY_PROJECT_ID"});
```


## Usage

### Get Queues List

```javascript
imq.queues(options, callback(error, body) {});
```

**Options:**

* `page`: The 0-based page to view. The default is 0.
* `per_page`: The number of queues to return per page. The default is 30, the maximum is 100.

--

### Get a Queue Object

You can have as many queues as you want, each with their own unique set of messages.

```javascript
var queue = imq.queue("my_queue");
```

**Note:** if queue with desired name does not exist it returns fake queue.
Queue will be created automatically on post of first message or queue configuration update.

--

### Retrieve Queue Information

```javascript
queue.info(callback(error, body) {});
```

--

### Post a Message on a Queue

Messages are placed on the queue in a FIFO arrangement.
If a queue does not exist, it will be created upon the first posting of a message.

```javascript
queue.post(messages, callback(error, body) {});

// single message
queue.post("hello IronMQ!", callback(error, body) {});
// with options
queue.post({body: "hello IronMQ", delay: 30}, callback(error, body) {});
// or multiple messages
queue.post(["hello", "IronMQ"], callback(error, body) {});
// messages with options
queue.post(
  [{body: "hello", timeout: 40},
   {body: "IronMQ", timeout: 80}],
  callback(error, body) {}
);
```

**Optional messages' parameters:**

* `timeout`: After timeout (in seconds), item will be placed back onto queue.
You must delete the message from the queue to ensure it does not go back onto the queue.
 Default is 60 seconds. Minimum is 30 seconds. Maximum is 86,400 seconds (24 hours).

* `delay`: The item will not be available on the queue until this many seconds have passed.
Default is 0 seconds. Maximum is 604,800 seconds (7 days).

* `expires_in`: How long in seconds to keep the item on the queue before it is deleted.
Default is 604,800 seconds (7 days). Maximum is 2,592,000 seconds (30 days).

--

### Get a Messages off a Queue

```javascript
queue.get(options, callback(error, body) {});
```

**Options:**

* `n`: The maximum number of messages to get. Default is 1. Maximum is 100.

* `timeout`: After timeout (in seconds), item will be placed back onto queue.
You must delete the message from the queue to ensure it does not go back onto the queue.
If not set, value from POST is used. Default is 60 seconds. Minimum is 30 seconds.
Maximum is 86,400 seconds (24 hours).

When `n` parameter is specified and greater than 1 method returns list of messages.
Otherwise, message's object will be returned.

When you pop/get a message from the queue, it is no longer on the queue but it still exists within the system.
You have to explicitly delete the message or else it will go back onto the queue after the `timeout`.

--

### Touch a Message on a Queue

Touching a reserved message extends its timeout by the duration specified when the message was created, which is 60 seconds by default.

```javascript
queue.touch(message_id, callback(error, body) {});
```

--

### Release Message

```javascript
queue.release(message_id, options, callback(error, body) {});
```

**Options:**

* `delay`: The item will not be available on the queue until this many seconds have passed.
Default is 0 seconds. Maximum is 604,800 seconds (7 days).

--

### Delete a Message from a Queue

```javascript
queue.delete(message_id, callback(error, body) {});
```

Be sure to delete a message from the queue when you're done with it.

--

### Clear a Queue

```javascript
queue.clear(callback(error, body) {});
```

--

### Delete a Message Queue

```javascript
queue.del_queue(callback(error, body) {});
```

--

## Push Queues

IronMQ push queues allow you to setup a queue that will push to an endpoint, rather than having to poll the endpoint. 
[Here's the announcement for an overview](http://blog.iron.io/2013/01/ironmq-push-queues-reliable-message.html). 

### Update a Message Queue

```javascript
queue.update(options, callback(error, body) {});
```

**The following options are all related to Push Queues:**

* `subscribers`: An array of subscriber hashes containing a “url” field.
This set of subscribers will replace the existing subscribers.
To add or remove subscribers, see the add subscribers endpoint or the remove subscribers endpoint.
See below for example json.
* `push_type`: Either `multicast` to push to all subscribers or `unicast` to push to one and only one subscriber.
Default is `multicast`.
* `retries`: How many times to retry on failure. Default is 3. Maximum is 100.
* `retries_delay`: Delay between each retry in seconds. Default is 60.

**Example:**

```javascript
queue.update(
  {push_type: "multicast",
   retries: 5,
   subscribers: [
     {url: "http://my.first.end.point/push"},
     {url: "http://my.second.end.point/push"}
   ]},
  callback(error, body) {}
);
```

--

### Add/Remove Subscribers on a Queue

```javascript
queue.add_subscribers({url:  "http://nowhere.com"}, callback(error, body) {});

queue.add_subscribers(
  [{url: 'http://first.endpoint.xx/process'},
   {url: 'http://second.endpoint.xx/process'}],
  callback(error, body) {}
);


queue.rm_subscribers({url: "http://nowhere.com"}, callback(error, body) {});

queue.rm_subscribers(
  [{url: 'http://first.endpoint.xx/process'},
   {url: 'http://second.endpoint.xx/process'}],
  callback(error, body) {}
);
```

--

### Get Message Push Status

After pushing a message:

```javascript
queue.msg_push_statuses(message_id, callback(error, body) {});
```

--

### Acknowledge / Delete Message Push Status

```javascript
queue.del_msg_push_status(message_id, subscriber_id, callback(error, body) {});
```

--

### Revert Queue Back to Pull Queue

If you want to revert you queue just update `push_type` to `"pull"`.

```javascript
queue.update({push_type: "pull"}, callback(error, body) {});
```

--

## Further Links

* [IronMQ Overview](http://dev.iron.io/mq/)
* [IronMQ REST/HTTP API](http://dev.iron.io/mq/reference/api/)
* [Push Queues](http://dev.iron.io/mq/reference/push_queues/)
* [Other Client Libraries](http://dev.iron.io/mq/libraries/)
* [Live Chat, Support & Fun](http://get.iron.io/chat)

-------------
© 2011 - 2013 Iron.io Inc. All Rights Reserved.
