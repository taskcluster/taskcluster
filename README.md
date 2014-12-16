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

* Here's a simple command:

    ```python
    import taskcluster
    index = taskcluster.Index({'credentials': {'clientId': 'id', 'accessToken': 'accessToken'}})
    index.ping()
    ```

* Keyword arguments for API methods are supported.  The javascript client
  accepts only positional arguments.  You may use either positional arguments
  or keyword, never both.  If the method requires an input payload, you must
  specify it as the last positional argument.  If you are using keyword
  arguments, the payload is the first argument.

    ```python
    import taskcluster
    api = taskcluster.api()
    api.method('1', '2', '3', {'data': 'here'})
    ```
    Assuming apiMethod has a route of `/method/<arg1>/<arg2>/<arg3>`,
    this will result in a calle to `/method/pie/2/3`

    The same call can be achieved using keyword arguments of:

    ```python
    import taskcluster
    api = taskcluster.api()
    api.method({'data': 'here'}, arg1='1', arg2='2', arg3='3')

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
  method.  When using positional arguments, it's the last argument.  When using
  keyword arguments, the payload is the first and only positional argument

    ```python
    from taskcluster import client
    index = client.index()
    index.listNamespaces('mozilla-central', payload={'continuationToken': 'a_token'})
    ```

There is a bug in the PyHawk library (as of 0.1.3) which breaks bewit
generation for URLs that do not have a query string.  This is being addressed
in [PyHawk PR 27](https://github.com/mozilla/PyHawk/pull/27). 
