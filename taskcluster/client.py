"""This module is used to interact with taskcluster rest apis"""

import sys
import os
import json
import logging
import functools


# For finding apis.json
from pkg_resources import resource_string
#import requests
#import hawk

log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)
# Only for debugging XXX: turn off the True or thing when shipping
if True or os.environ.get('DEBUG_TASKCLUSTER_CLIENT'):
  log.addHandler(logging.StreamHandler())
log.addHandler(logging.NullHandler())
log.info('Hello');

API_CONFIG = json.loads(resource_string(__name__, 'apis.json'))

class Client(object):

  def __init__(self, apiName, api):
    log.debug('Creating a client object for %s' % apiName)

    self.name = apiName

    c = self.config = {}
    ref = api['reference']

    # I wonder if anyone cares about this?
    if os.environ.get('TASKCLUSTER_CLIENT_LIVE_API'):
      ref = json.loads(requests.get(config['referenceUrl']).text)
    
    # Set default options for the Class
    for opt in ('baseUrl', 'exchangePrefix'):
      if ref.has_key(opt):
        c[opt] = ref[opt]
    
    for entry in ref['entries']:
      apiFunc = entry['name']
      log.info('Creating instance method for %s.%s.%s', __name__, apiName, apiFunc)
      assert not hasattr(self, apiFunc), 'I will not overwrite existing function'
      log.debug('Setting %s of %s - %s', apiFunc, self.name, self)
      def addApiCall(e):
        setattr(self, apiFunc, lambda *args, **kwargs: self.makeApiCall(e, *args, **kwargs))
      addApiCall(entry)

  def makeApiCall(self, entry, *args, **kwargs):
    print json.dumps(entry, indent=2)
    print args
    print kwargs







# This has to be done after the Client class is declared
THIS_MODULE = sys.modules[__name__]
for key, value in list(API_CONFIG.items()):
  setattr(THIS_MODULE, key, Client(key, value))
