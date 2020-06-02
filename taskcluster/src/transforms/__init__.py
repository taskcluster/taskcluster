import os
import json

def _dependency_versions():
    with open('package.json', 'r') as pkg:
        with open('.go-version', 'r') as goversion:
            node_version = json.load(pkg)["engines"]["node"].strip()
            go_version = goversion.read().strip()
            pg_version = 11
            return (node_version, go_version, pg_version)



