"""This module is used to interact with taskcluster rest apis"""

import sys
import os
import json
import logging
import functools
import copy
import urlparse


# For finding apis.json
from pkg_resources import resource_string
import requests
# import hawk

import exceptions

log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)
# Only for debugging XXX: turn off the True or thing when shipping
if True or os.environ.get('DEBUG_TASKCLUSTER_CLIENT'):
  log.addHandler(logging.StreamHandler())
log.addHandler(logging.NullHandler())

API_CONFIG = json.loads(resource_string(__name__, 'apis.json'))


class Client(object):
  """ Instances of this class are API helpers for a specific API reference.
  They know how to load their data from either a statically defined JSON file
  which is packaged with the library, or by reading an environment variable can
  load the individual api endpoints from the web
  
  A difference between the JS and Python client is that the payload for JS
  client is always the last argument in the API method.  That works nicely
  because JS doesn't have keyword arguments.  Python does have kwargs and I'd
  like to support them (because I like to use them). The result is that I'm
  going to make the payload a mandatory keyword argument for methods which have
  an input schema.
  """

  def __init__(self, apiName, api):
    log.debug('Creating a client object for %s', apiName)

    self.name = apiName

    c = self.config = {}
    ref = api['reference']

    # I wonder if anyone cares about this?
    if os.environ.get('TASKCLUSTER_CLIENT_LIVE_API'):
      ref = json.loads(requests.get(config['referenceUrl']).text)

    # Set default options for the Class
    for opt in ('baseUrl', 'exchangePrefix'):
      if opt in ref:
        c[opt] = ref[opt]
        log.debug('Setting default option %s to %s', opt, self.config[opt])

    for entry in [x for x in ref['entries'] if x['type'] == 'function']:
      apiFunc = entry['name']
      log.info('Creating instance method for %s.%s.%s',
               __name__, apiName, apiFunc)
      
      assert not hasattr(self, apiFunc), \
          'I will not overwrite existing function'
      log.debug('Setting %s of %s - %s', apiFunc, self.name, self)

      # We can't just setattr in the loop because if we do, we end up just
      # setting all of the API functions to being the last entry of the API
      # reference. Instead, we create a new scope so that we can add a lambda
      # that actually works.
      def addApiCall(evt):
        setattr(self, apiFunc,
                lambda *args, **kwargs:
                self._makeApiCall(evt, *args, **kwargs))
      addApiCall(entry)

  def _makeApiCall(self, entry, *args, **kwargs):
    """ This function is used to dispatch calls to other functions
    for a given API Reference entry"""

    payload = None

    # I forget if **ing a {} results in a new {} or a reference
    _kwargs = copy.deepcopy(kwargs)
    if 'input' in entry and 'payload' in _kwargs:
      payload = _kwargs['payload']
      del _kwargs['payload']
      log.debug('We have a payload!')

    apiArgs = self._processArgs(entry['args'], *args, **_kwargs)
    route = self._subArgsInRoute(entry['route'], apiArgs)
    log.debug('Route is: %s', route)

    return self._makeHttpRequest(entry['method'], route, payload)


  def _processArgs(self, reqArgs, *args, **kwargs):
    """ Take the list of required arguments, positional arguments
    and keyword arguments and return a dictionary which maps the
    value of the given arguments to the required parameters.

    Keyword arguments will overwrite positional arguments.
    """
    
    data = {}

    # We know for sure that if we don't give enough arguments that the call
    # should fail.  We don't yet know if we should fail because of two many
    # arguments because we might be overwriting positional ones with kw ones
    if len(reqArgs) > len(args) + len(kwargs):
      raise TypeError('API Method was not given enough arguments')

    i = 0
    for arg in args:
      log.debug('Found a positional argument: %s', arg);
      data[reqArgs[i]] = arg;
      i += 1
    
    log.debug('After processing positional arguments, we have: %s', data)

    data.update(kwargs)

    log.debug('After keyword arguments, we have: %s', data)

    if len(reqArgs) != len(data):
      errMsg = 'API Method takes %d arguments, %d given' % (len(reqArgs), len(data))
      raise TypeError(errMsg)

    for reqArg in reqArgs:
      if reqArg not in data:
        errMsg = 'API Method requires a "%s" argument' % reqArg
        raise TypeError(errMsg)

    return data


  def _subArgsInRoute(self, route, args):
    """ Given a route like "/task/<taskId>/artifacts" and a mapping like
    {"taskId": "12345"}, return a string like "/task/12345/artifacts"
    """

    # TODO: Let's just pretend this is a good idea  
    route = route.replace('<', '%(').replace('>', ')s') % args
    return route.lstrip('/')

  def _makeHttpRequest(self, method, route, payload):
    """ Make an HTTP Request for the API endpoint.  This method wraps
    the logic about doing failure retry and passes off the actual work
    of doing an HTTP request to another method."""

    baseUrl = self.config['baseUrl']
    # urljoin ignores the last param of the baseUrl if the base
    # url doesn't end in /.  I wonder if it's better to just
    # do something basic like baseUrl + route instead
    if not baseUrl.endswith('/'):
      baseUrl += '/'
    fullUrl = urlparse.urljoin(baseUrl, route.lstrip('/'))
    log.debug('Full URL used is: %s', fullUrl)
  
    # TODO: This is where retry logic should go if we have it 
    apiData = self._makeSingleHttpRequest(method, fullUrl, payload)

    log.debug('Got a response from the API')

    return apiData


  def _makeSingleHttpRequest(self, method, url, payload):
    try:
      return requests.request(method, url, data=payload).json()
    except (requests.exceptions.ConnectionError, requests.exceptions.HTTPError,
            requests.exceptions.TooManyRedirects, requests.exceptions.Timeout,
            requests.exceptions.RequestException) as e:
      # TODO: Handle these exceptions better!
      errStr = 'Error connecting or talking to API host'
      log.error(errStr)
      raise exceptions.TaskclusterAPIFailure(errStr)
    except ValueError as ve:
      errStr = 'Could not parse response into JSON'
      log.error(errStr)
      raise exceptions.TaskclusterAPIFailure(errStr)




# This has to be done after the Client class is declared
THIS_MODULE = sys.modules[__name__]
for key, value in list(API_CONFIG.items()):
  setattr(THIS_MODULE, key, Client(key, value))
