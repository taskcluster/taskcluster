Taskcluster Client Library in Python
======================================

This is a library used to interact with Taskcluster within Python programs.  It
presents the entire REST API to consumers as well as being able to generate
URLs Signed by Hawk credentials.  It can also generate routing keys for
listening to pulse messages from Taskcluster.

The library builds the REST API methods from the same [API Reference
format](http://docs.taskcluster.net/tools/references/index.html) as the
Javascript client library.

The REST API methods are documented on
[http://docs.taskcluster.net/](http://docs.taskcluster.net/)

The main differences between the Python and JS library are:

* You don't need to instantiate individual API Client objects.  In the
  Javascript client, you would do:

    ```javascript
    var taskcluster = require('taskcluster-client');
    var index = new taskcluster.index();
    index.findTask('my-namespace');
    ```
    but in the Python client, you'd do:
    ```python
    from taskcluster import client
    client.index.findTask('my-namespace')
    ```

* Options are shared between all instance of all API Clients.  To change the
  options you can run:

    ```python
    from taskcluster import client, config
    config['credentials']['clientId'] = 'Bob'
    config['credentials']['accessToken'] = 'TokensRUs'
    ```

* Keyword arguments for API methods are supported.  The javascript client
  accepts only positional arguments.  Positional arguments are read first and
  interpreted as the corresponding argument in the route for the API.  Keyword
  arguments are then read and overwrite values set by positional arguments:

    ```python
    from taskcluster import client
    client.api.method('1', '2', '3', arg1='pie')
    ```
    Assuming apiMethod has a route of `/method/<arg1>/<arg2>/<arg3>`, this will result in a calle to `/method/pie/2/3`

* Method Payloads are specified through the `payload` keyword passed to the API
  method

    ```python
    from taskcluster import client
    client.index.listNamespaces('mozilla-central', payload={'continuationToken': 'a_token'})
    ```

There is a bug in the PyHawk library (as of 0.1.3) which breaks bewit
generation for URLs that do not have a query string.  This is being addressed
in [PyHawk PR 27](https://github.com/mozilla/PyHawk/pull/27). 

There are a couple things:

* Per-API client options
* Using `urlparse.urlparse` and `urlparse.urlunparse` to construct URLs
* Support `*args` and `**kwargs` for `Client.topicName`
* Building signed URLs should be done using the Node client and compared
  to the result of the same operation with this client
