from __future__ import division, print_function
import unittest
import importlib


class ImportTest(unittest.TestCase):
    """These tests are intended to ensure that existing means of importing modules within
    this package continue to work.  In most cases, they just call import_module and consider
    an error-free return to be success, or that a few sub-paths exist."""

    def test_taskcluster(self):
        taskcluster = importlib.import_module("taskcluster")
        taskcluster.createSession
        taskcluster.createTemporaryCredentials
        taskcluster.optionsFromEnvironment
        taskcluster.fromNow
        taskcluster.fromNowJSON
        taskcluster.scopeMatch
        taskcluster.slugId
        taskcluster.stableSlugId
        taskcluster.TaskclusterRestFailure
        taskcluster.exceptions.TaskclusterRestFailure
        taskcluster.Queue

    def test_taskcluster_client(self):
        client = importlib.import_module("taskcluster.client")
        client.createSession
        client.createTemporaryCredentials

    def test_taskcluster_exceptions(self):
        exceptions = importlib.import_module("taskcluster.exceptions")
        exceptions.TaskclusterRestFailure

    def test_taskcluster_service(self):
        queue = importlib.import_module("taskcluster.queue")
        queue.Queue

    def taskcluster_aio(self):
        aio = importlib.import_module("taskcluster.aio")
        aio.Queue

    def test_taskcluster_aio_service(self):
        queue = importlib.import_module("taskcluster.aio.queue")
        queue.Queue
