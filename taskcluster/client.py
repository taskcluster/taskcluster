"""This module is used to interact with taskcluster rest apis"""

import sys
import json

# For finding apis.json
from pkg_resources import resource_string
#import requests
#import hawk

API_CONFIG = json.loads(resource_string(__name__, 'apis.json'))

class Client(object):
  def __init__(self, name, config):
    print(name);


# This has to be done after the Client class is declared
THIS_MODULE = sys.modules[__name__]
for key, value in list(API_CONFIG.items()):
  setattr(THIS_MODULE, key, Client(key, value))
