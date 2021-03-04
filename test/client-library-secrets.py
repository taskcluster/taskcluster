#! /usr/bin/python

# Python is the common scripting language between the docker images used to
# test the various Taskcluster client libraries.  This fetches the
# `testing/client-libraries` secret and writes out shell-compatible export
# statements for each value it contains.
#
# This secret contains a client ID and access token for a TC client in the
# current deployment, used for integration tests in the client libraries.

try:
    import urllib.request
    PY27 = False
except ImportError:
    import urllib
    PY27 = True
import os
import json

proxy_url = os.environ['TASKCLUSTER_PROXY_URL'].rstrip('/')

secret_url = proxy_url + '/api/secrets/v1/secret/project/taskcluster/testing/client-libraries'
if PY27:
    response = urllib.urlopen(secret_url)
    if response.getcode() != 200:
        raise RuntimeError('non-200 response from ' + secret_url)
    secret = json.load(response)
else:
    with urllib.request.urlopen(secret_url) as response:
        if response.status != 200:
            raise RuntimeError('non-200 response from ' + secret_url)
        secret = json.load(response)
for k, v in secret['secret'].items():
    # NOTE: this does not escape the values!  For typical values (client-id, access token)
    # this is not necessary; but if this grows to handle other values, better escaping may
    # be required.
    print('export %s="%s"' % (k, v))
