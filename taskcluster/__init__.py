""" Python client for Taskcluster """

import logging
import os
import client
import utils
reload(client)
reload(utils)

log = logging.getLogger(__name__)

if os.environ.get('DEBUG_TASKCLUSTER_CLIENT'):
  log.setLevel(logging.DEBUG)
  if len(log.handlers) == 0:
    log.addHandler(logging.StreamHandler())
log.addHandler(logging.NullHandler())

from client import *  # NOQA
from utils import *  # NOQA
