""" Taskcluster client exceptions """


class TaskclusterFailure(Exception):
    """ Base exception for all Taskcluster client errors"""
    pass


class TaskclusterRestFailure(TaskclusterFailure):
    """ Failures in the HTTP Rest API """
    def __init__(self, msg, superExc, status_code=500, body={}):
        TaskclusterFailure.__init__(self, msg)
        self.superExc = superExc
        self.status_code = status_code
        self.body = body

    def __reduce__(self):
        return (TaskclusterRestFailure, (str(self), self.superExc, self.status_code, self.body))


class TaskclusterConnectionError(TaskclusterFailure):
    """ Error connecting to resource """
    def __init__(self, msg, superExc):
        TaskclusterFailure.__init__(self, msg)
        self.superExc = superExc

    def __reduce__(self):
        return (TaskclusterConnectionError, (str(self), self.superExc))


class TaskclusterAuthFailure(TaskclusterFailure):
    """ Invalid Credentials """
    def __init__(self, msg, superExc=None, status_code=500, body={}):
        TaskclusterFailure.__init__(self, msg)
        self.superExc = superExc
        self.status_code = status_code
        self.body = body

    def __reduce__(self):
        return (TaskclusterAuthFailure, (str(self), self.superExc, self.status_code, self.body))


class TaskclusterTopicExchangeFailure(TaskclusterFailure):
    """ Error while creating a Topic Exchange routing key """
    pass


class TaskclusterArtifactError(TaskclusterFailure):
    """Download of an 'error' Artifact"""
    def __init__(self, message, reason):
        TaskclusterFailure.__init__(self, message)
        self.reason = reason

    def __reduce__(self):
        return (TaskclusterArtifactError, (str(self), self.reason))


class ObjectHashVerificationError(TaskclusterFailure):
    """Raised when the downloading an object that does not match its hashes."""
    pass
