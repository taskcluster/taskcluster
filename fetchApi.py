import os
import json

import requests

manifestUrl = 'http://references.taskcluster.net/manifest.json'
localManifestFile = os.environ.get('LOCAL_MANIFEST_FILE', 'manifest.json')
outputFile = os.environ.get('API_REF_OUT', 'apis.json')

apiManifest = None

try:
  apiManifest = requests.get(manifestUrl).json()
  print 'Fetched manifest url from "%s"' % manifestUrl
except:
  print 'Manifest not found on remote host, falling back to local copy'
  print 'Local copy is file "%s"' % localManifestFile
  with open(localManifestFile) as f:
    apiManifest = json.load(f)

apiReference = {}
for apiName, apiRefUrl in apiManifest.items():
  print 'Fetching %s' % apiName
  api = requests.get(apiRefUrl).json()
  apiReference[apiName] = api

print 'Writing API reference file "%s"' % outputFile

with open(outputFile, 'w') as f:
  json.dump(apiReference, f, indent=2);
