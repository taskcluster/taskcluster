Taskcluster Client Library in Python
======================================

[![Build Status](https://travis-ci.org/jhford/taskcluster-client.py.svg?branch=master)](https://travis-ci.org/jhford/taskcluster-client.py)

This is a library used to interact with Taskcluster within Python programs.  It
presents the entire REST API to consumers as well as being able to generate
URLs Signed by Hawk credentials.  It can also generate routing keys for
listening to pulse messages from Taskcluster.

The library builds the REST API methods from the same [API Reference
format](http://docs.taskcluster.net/tools/references/index.html) as the
Javascript client library.

'NOTE:' Temporary credentials are implemented, but they don't work from this
library right now

The REST API methods are documented on
[http://docs.taskcluster.net/](http://docs.taskcluster.net/)

Here's how you'd do a simple call:

    ```python
    import taskcluster
    index = taskcluster.Index({'credentials': {'clientId': 'id', 'accessToken': 'accessToken'}})
    index.ping()
    ```

* Options can be shared between instances of API clients by setting the variable in the module
  config dictionary:

    ```python
    import taskcluster
    config['credentials']['accessToken'] = 'TokensRUs'
    print client.index().options['credentials']['clientId']
    ```
* Options can be set per API client with the `BaseClient.setOption(key, value)` method
  and interogated with the `BaseClient.options` read-only property

  ```python
  from taskcluster import client
  index = client.index()
  index.options['baseUrl'] # returns u'https://index.taskcluster.net/v1'
  index.setOptions('baseUrl', 'http://www.google.com')
  index.options['baseUrl'] # returns 'https://www.google.com'
  ```

* Keyword arguments for API methods are supported.  The javascript client
  accepts only positional arguments.  Positional arguments are read first and
  interpreted as the corresponding argument in the route for the API.  Keyword
  arguments are then read and overwrite values set by positional arguments:

    ```python
    from taskcluster import client
    api = client.api()
    api.method('1', '2', '3', arg1='pie')
    ```
    Assuming apiMethod has a route of `/method/<arg1>/<arg2>/<arg3>`,
    this will result in a calle to `/method/pie/2/3`

* Options for the topic exchange methods can be in the form of either a single
  dictionary argument or keyword arguments.  Only one form is allowed

    ```python
    from taskcluster import client
    qEvt = client.QueueEvents()
    # The following calls are equivalent
    qEvt.taskCompleted({'taskId': 'atask'})
    qEvt.taskCompleted(taskId='atask')
    ```

* Method Payloads are specified through the `payload` keyword passed to the API
  method

    ```python
    from taskcluster import client
    index = client.index()
    index.listNamespaces('mozilla-central', payload={'continuationToken': 'a_token'})
    ```

There is a bug in the PyHawk library (as of 0.1.3) which breaks bewit
generation for URLs that do not have a query string.  This is being addressed
in [PyHawk PR 27](https://github.com/mozilla/PyHawk/pull/27). 

There are a couple things that would be nice:

* Per-API client options
* Using `urlparse.urlparse` and `urlparse.urlunparse` to construct URLs
* Support `*args` and `**kwargs` for `Client.topicName`
* Building signed URLs should be done using the Node client and compared
  to the result of the same operation with this client
