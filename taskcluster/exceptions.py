""" Taskcluster client exceptions """


class TaskclusterFailure(Exception):
  """ Base exception for all Taskcluster client errors"""
  pass


class TaskclusterRestFailure(TaskclusterFailure):
  """ Failures in the HTTP Rest API """
  def __init__(self, msg, superExc, res=None):
    TaskclusterFailure.__init__(self, msg)
    self.superExc = superExc
    self.res = res
