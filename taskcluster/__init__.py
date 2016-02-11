""" Python client for Taskcluster """
from __future__ import absolute_import, division, print_function, unicode_literals

import logging
import os

log = logging.getLogger(__name__)

if os.environ.get('DEBUG_TASKCLUSTER_CLIENT'):
    log.setLevel(logging.DEBUG)
    if len(log.handlers) == 0:
        log.addHandler(logging.StreamHandler())
log.addHandler(logging.NullHandler())
