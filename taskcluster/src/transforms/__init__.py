import json

from taskgraph.transforms.base import TransformSequence

transforms = TransformSequence()


@transforms.add
def taskcluster_images(config, jobs):
    with open('package.json', 'r') as pkg:
        with open('.go-version', 'r') as goversion:
            node_version = json.load(pkg)["engines"]["node"]
            go_version = goversion.read()
            for job in jobs:
                image = job["worker"]["docker-image"]
                if isinstance(image, dict) and image.keys()[0] == "taskcluster":
                    repo = image["taskcluster"]
                    if (repo == "node-and-go"):
                        job["worker"]["docker-image"] = "taskcluster/node-and-go:node{}-{}".format(
                            node_version,
                            go_version
                        ).strip()
                yield job
