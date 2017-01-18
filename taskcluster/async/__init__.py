""" Python client for Taskcluster """

import logging
import os
import importlib
import taskcluster.utils
import taskcluster.exceptions
from . import _client_importer
importlib.reload(taskcluster._client_importer)
importlib.reload(taskcluster.utils)
importlib.reload(taskcluster.exceptions)

log = logging.getLogger(__name__)

if os.environ.get('DEBUG_TASKCLUSTER_CLIENT'):
    log.setLevel(logging.DEBUG)
    if len(log.handlers) == 0:
        log.addHandler(logging.StreamHandler())
log.addHandler(logging.NullHandler())

from taskcluster.utils import *  # NOQA
from taskcluster.exceptions import *  # NOQA
from ._client_importer import *  # NOQA
