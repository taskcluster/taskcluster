# coding=utf-8
#####################################################
# THIS FILE IS AUTOMATICALLY GENERATED. DO NOT EDIT #
#####################################################
# noqa: E128,E201
from ..client import BaseClient
from ..client import createApiClient
from ..client import config
from ..client import createTemporaryCredentials
from ..client import createSession
_defaultConfig = config


class Object(BaseClient):
    """
    The object service provides HTTP-accessible storage for large blobs of data.

    Objects can be uploaded and downloaded, with the object data flowing directly
    from the storage "backend" to the caller, and not directly via this service.
    Once uploaded, objects are immutable until their expiration time.
    """

    classOptions = {
    }
    serviceName = 'object'
    apiVersion = 'v1'

    def ping(self, *args, **kwargs):
        """
        Ping Server

        Respond without doing anything.
        This endpoint is used to check that the service is up.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["ping"], *args, **kwargs)

    def lbheartbeat(self, *args, **kwargs):
        """
        Load Balancer Heartbeat

        Respond without doing anything.
        This endpoint is used to check that the service is up.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["lbheartbeat"], *args, **kwargs)

    def version(self, *args, **kwargs):
        """
        Taskcluster Version

        Respond with the JSON version object.
        https://github.com/mozilla-services/Dockerflow/blob/main/docs/version_object.md

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["version"], *args, **kwargs)

    def createUpload(self, *args, **kwargs):
        """
        Begin upload of a new object

        Create a new object by initiating upload of its data.

        This endpoint implements negotiation of upload methods.  It can be called
        multiple times if necessary, either to propose new upload methods or to
        renew credentials for an already-agreed upload.

        The `name` parameter can contain any printable ASCII character (0x20 - 0x7e).
        The `uploadId` must be supplied by the caller, and any attempts to upload
        an object with the same name but a different `uploadId` will fail.
        Thus the first call to this method establishes the `uploadId` for the
        object, and as long as that value is kept secret, no other caller can
        upload an object of that name, regardless of scopes.  Object expiration
        cannot be changed after the initial call, either.  It is possible to call
        this method with no proposed upload methods, which has the effect of "locking
        in" the `expiration`, `projectId`, and `uploadId` properties and any
        supplied hashes.

        Unfinished uploads expire after 1 day.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["createUpload"], *args, **kwargs)

    def finishUpload(self, *args, **kwargs):
        """
        Mark an upload as complete.

        This endpoint marks an upload as complete.  This indicates that all data has been
        transmitted to the backend.  After this call, no further calls to `uploadObject` are
        allowed, and downloads of the object may begin.  This method is idempotent, but will
        fail if given an incorrect uploadId for an unfinished upload.

        It is possible to finish an upload with no hashes specified via either
        `startUpload` or `finishUpload`.  However, many clients will refuse to
        download an object with no hashes.  The utility methods included with the
        client libraries always include hashes as of version 44.0.0.

        Note that, once `finishUpload` is complete, the object is considered immutable.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["finishUpload"], *args, **kwargs)

    def startDownload(self, *args, **kwargs):
        """
        Download object data

        Start the process of downloading an object's data.  Call this endpoint with a list of acceptable
        download methods, and the server will select a method and return the corresponding payload.

        Returns a 406 error if none of the given download methods are available.

        See [Download Methods](https://docs.taskcluster.net/docs/reference/platform/object/download-methods) for more detail.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["startDownload"], *args, **kwargs)

    def object(self, *args, **kwargs):
        """
        Get an object's metadata

        Get the metadata for the named object.  This metadata is not sufficient to
        get the object's content; for that use `startDownload`.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["object"], *args, **kwargs)

    def download(self, *args, **kwargs):
        """
        Get an object's data

        Get the data in an object directly.  This method does not return a JSON body, but
        redirects to a location that will serve the object content directly.

        URLs for this endpoint, perhaps with attached authentication (`?bewit=..`),
        are typically used for downloads of objects by simple HTTP clients such as
        web browsers, curl, or wget.

        This method is limited by the common capabilities of HTTP, so it may not be
        the most efficient, resilient, or featureful way to retrieve an artifact.
        Situations where such functionality is required should ues the
        `startDownload` API endpoint.

        See [Simple Downloads](https://docs.taskcluster.net/docs/reference/platform/object/simple-downloads) for more detail.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["download"], *args, **kwargs)

    def heartbeat(self, *args, **kwargs):
        """
        Heartbeat

        Respond with a service heartbeat.

        This endpoint is used to check on backing services this service
        depends on.

        This method is ``stable``
        """

        return self._makeApiCall(self.funcinfo["heartbeat"], *args, **kwargs)

    funcinfo = {
        "createUpload": {
            'args': ['name'],
            'input': 'v1/create-upload-request.json#',
            'method': 'put',
            'name': 'createUpload',
            'output': 'v1/create-upload-response.json#',
            'route': '/upload/<name>',
            'stability': 'stable',
        },
        "download": {
            'args': ['name'],
            'method': 'get',
            'name': 'download',
            'route': '/download/<name>',
            'stability': 'stable',
        },
        "finishUpload": {
            'args': ['name'],
            'input': 'v1/finish-upload-request.json#',
            'method': 'post',
            'name': 'finishUpload',
            'route': '/finish-upload/<name>',
            'stability': 'stable',
        },
        "heartbeat": {
            'args': [],
            'method': 'get',
            'name': 'heartbeat',
            'route': '/__heartbeat__',
            'stability': 'stable',
        },
        "lbheartbeat": {
            'args': [],
            'method': 'get',
            'name': 'lbheartbeat',
            'route': '/__lbheartbeat__',
            'stability': 'stable',
        },
        "object": {
            'args': ['name'],
            'method': 'get',
            'name': 'object',
            'output': 'v1/get-object-response.json#',
            'route': '/metadata/<name>',
            'stability': 'stable',
        },
        "ping": {
            'args': [],
            'method': 'get',
            'name': 'ping',
            'route': '/ping',
            'stability': 'stable',
        },
        "startDownload": {
            'args': ['name'],
            'input': 'v1/download-object-request.json#',
            'method': 'put',
            'name': 'startDownload',
            'output': 'v1/download-object-response.json#',
            'route': '/start-download/<name>',
            'stability': 'stable',
        },
        "version": {
            'args': [],
            'method': 'get',
            'name': 'version',
            'route': '/__version__',
            'stability': 'stable',
        },
    }


__all__ = ['createTemporaryCredentials', 'config', '_defaultConfig', 'createApiClient', 'createSession', 'Object']
