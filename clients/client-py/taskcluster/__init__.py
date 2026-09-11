"""Python client for Taskcluster"""

import logging
import os

from taskcluster.exceptions import *  # NOQA
from taskcluster.generated._client_importer import *  # NOQA
from taskcluster.utils import *  # NOQA

from .client import (
    createSession,  # NOQA
    createTemporaryCredentials,  # NOQA
)

log = logging.getLogger(__name__)

if os.environ.get("DEBUG_TASKCLUSTER_CLIENT"):
    log.setLevel(logging.DEBUG)
    if len(log.handlers) == 0:
        log.addHandler(logging.StreamHandler())
log.addHandler(logging.NullHandler())
