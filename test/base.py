""" Basic and helper things for testing the Taskcluster Python client"""
# -*- coding: utf-8 -*-
import unittest
import os
import sys
import logging
import signal
import time
import socket
import json
import threading
import select

import psutil

from taskcluster.client import _dmpJson

log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)
log.addHandler(logging.NullHandler())
if os.environ.get('DEBUG_TASKCLUSTER_CLIENT'):
  log.addHandler(logging.StreamHandler())


class TCTest(unittest.TestCase):
  """ Let's have a common base class for all Taskcluster-client tests."""
  pass


def createApiRef(**kwargs):
  default = {
    'version': '0.0.1',
    'title': 'API Title',
    'description': 'API Description',
    'baseUrl': 'https://localhost:8555/v1',
    'exchangePrefix': 'test/v1',
    'entries': []
  }
  default.update(kwargs)
  return {'reference': default}


def createApiEntryFunction(name, numArg, hasInput, method='get', **kwargs):
  if 'route' in kwargs:
    route = kwargs['route']
    fullArgs = [x[1:-1] for x in route.split('/') if x.startswith('<')]
  else:
    fullArgs = ['arg%d' % i for i in range(numArg)]
    routeChunks = ['/<%s>' % j for j in fullArgs]
    route = ''.join(routeChunks)
    route = '/%s%s' % (name, route)

  default = {
    'type': 'function',
    'method': method,
    'route': route,
    'name': name,
    'title': 'Test API Endpoint title',
    'description': 'Test API Endpoint Description',
    'output': 'http://localhost/schemas/v1/apiOutput',
    'args': fullArgs,
  }
  if hasInput:
    default['input'] = 'http://localhost/schemas/v1/apiInput'
  default.update(kwargs)
  return default


def createApiEntryTopicExchange(name, exchange, **kwargs):
  default = {
    'type': 'topic-exchange',
    'exchange': exchange,
    'name': name,
    'title': 'Test Topic Exchange',
    'description': 'Test Topic Exchange Description',
  }
  default.update(kwargs)
  return default


def createTopicExchangeKey(name, constant=None, multipleWords=False, maxSize=5, required=False, **kwargs):
  default = {
    'name': name,
    'summary': 'A short description of the key',
    'maxSize': maxSize,
    'required': required,
    'multipleWords': multipleWords
  }
  if constant:
    default['constant'] = constant
  default.update(kwargs)
  return default


class AuthClient(object):
  def __init__(self, clientId, accessToken, expires, scopes):
    self.clientId = clientId
    self.accessToken = accessToken
    self.expires = expires
    self.scopes = scopes

  def forNode(self):
    return {
      'clientId': self.clientId,
      'accessToken': self.accessToken,
      'expires': self.expires,
      'scopes': self.scopes
    }


# TODO: I should create a temp file, dup2 child's stdout/err to it then
# read it in and log.info it in .stop()
class MockAuthServer(object):
  """ Create a Mock of the Authentication server.  The clients should be a list
  of values as returned by MockAuthUser(str, str, datetime, list).forNode()

  The constructor starts the node-based server using the os module's posix
  wrapping functions as a second process.  Output to stdout/stderr is captured
  by a threading.Thread.

  A check is done on startup that the server actually started.  In case of slow
  machines, there are 10 retries spaced one second appart."""

  def __init__(self, clients, port=5555, nodeBin=os.environ.get('NODE_BIN', 'node')):
    self.port = port
    self.nodeScript = os.path.join(os.path.dirname(__file__), 'mockAuthServer.js')
    self.nodeBin = nodeBin
    self.command = [nodeBin, self.nodeScript]
    self.environment = {
      'PORT': str(port),
      'CLIENTS': _dmpJson([x.forNode() for x in clients]),
      'NODE_PATH': os.environ.get('NODE_PATH', ''),
      'PATH': os.environ['PATH'],
      'DEBUG': '*',
    }
    log.info('Initialized Mock Auth Server')
    log.info('Command is: ["%s"]', '", "'.join(self.command))
    log.info('Environment is: %s', json.dumps(self.environment, indent=2))

  def _listening(self):
    """ Return True if *anything* is listening on this server's port """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = s.connect_ex(('127.0.0.1', self.port))
    s.close()
    if result == 0:
      return True
    return False

  def start(self):
    """ Start up the configured server, but not until making sure that nothing
    is already using the port"""

    log.debug('Starting up Mock Auth Server')

    if self._listening():
      raise Exception('Something is already bound to %d', self.port)

    (rpipe, wpipe) = os.pipe()

    class OutputThread(threading.Thread):
      def __init__(self):
        self.finished = threading.Event()
        threading.Thread.__init__(self)

      def run(self):
        import traceback
        try:
          log.debug('Output thread started')
          while not self.finished.isSet():
            (rTr, rTw, ex) = select.select([rpipe], [], [], 1)
            for ready in rTr:
              data = os.read(ready, 2048)
              if data == '':
                # When select says a file is ready to read but the file returns
                # nothing, it means the file is closed.  In this context, that
                # means that the child has exited, closing the last FD to the
                # pipe
                self.finished.set()
              for line in data.rstrip('\n').split('\n'):
                if line.strip() != '':
                  log.info('NODE: %s', line)
          log.debug('Output thread finished')
        except:
          traceback.print_exc()
          raise

    self.outputThread = OutputThread()
    self.outputThread.start()
    log.info('Started output logging thread')

    schroedingersPid = os.fork()

    if 0 == schroedingersPid:
      # We're in the child!
      self.childPid = schroedingersPid
      sys.__stdin__.close()  # If we don't do this, pdb gets angry
      os.close(rpipe)
      # Some tools (e.g. Nose) like to replace sys.stdout and sys.stderr with
      # something that's not the real stdout/stderr.  This reference is to the
      # real ones and much nicer than using 1 and 2 as hardcodes
      os.dup2(wpipe, sys.__stderr__.fileno())
      os.dup2(wpipe, sys.__stdout__.fileno())

      # Using execvpe because for times when not using the Makefile
      # provided node infrastructure, we want to use the user's real
      # node
      os.execvpe(self.nodeBin, self.command, self.environment)
      raise Exception('If you see this, an os.execve() failed')
    else:
      # We're in the parent!
      os.close(wpipe)
      # Let's make sure the server is actually listening.  We're going to give
      # ourselves 10 attempts, spaced 1s from eachother
      for i in range(10):
        if self._listening():
          log.info('Server is now listening')
          return True
        else:
          log.debug('Tick Tock.  Where is the server...')
          time.sleep(1)
      # If we get to here, the server hasn't started up!
      raise Exception('Unable to verify that server started!')

  def __del__(self):
    """ We don't want to leave a bunch of servers lying around taking
    up ports, so let's make sure we kill the server when our object
    goes out of scope."""
    # Note: we know that this method depends on the psutil module and when the
    # whole interpreter is being torn down, the psutil module gets deleted
    # before this __del__() is run.  If we don't check for psutil existing, we
    # get an exception on interpreter shutdown.  Since we're starting the
    # process in the same process group, we don't really need to worry about
    # the child being killed on interpreter shutdown as killing the interpreter
    # will also end the child
    if psutil and self.running():
      self.stop()

  def running(self):
    """ Return a boolean representing whether or not the server is running """
    if hasattr(self, 'childPid'):
      return psutil.pid_exists(self.childPid)
    else:
      return False

  def stop(self):
    """ Stop the server, read its output and print the output to logs. """
    log.info('Stopping Mock Auth Server')

    # Kill the output thread
    self.outputThread.finished.set()
    self.outputThread.join()

    if not self.running():
      raise Exception('Cannot shutdown a process that is not running')
    os.kill(self.childPid, signal.SIGTERM)
    time.sleep(0.5)
    result = os.waitpid(self.childPid, os.WNOHANG)
    if result == (0, 0):
      log.info('Child didnt end quick enough, killing')
      os.kill(self.childPid, signal.SIGKILL)
      os.waitpid(self.childPid, 0)
    else:
      log.info('Child shutdown cleanly from SIGTERM')
