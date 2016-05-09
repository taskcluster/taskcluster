let taskDefinition = `
{
    "provisionerId": "DUMMYPROVISIONER",
    "workerType": "DUMMYWORKERTYPE",
    "schedulerId": "task-graph-scheduler",
    "taskGroupId": "DUMMYTASKGROUPID",
    "dependencies": [
        "DUMMYDEPENDENCYID"
    ],
    "requires": "all-completed",
    "routes": [
        "treeherder.dummyproject.dummya98d9bed366c133ebdf1feb5cf365a3c3703a337.123"
    ],
    "priority": "normal",
    "retries": 5,
    "created": "2016-04-15T18:12:20.561Z",
    "deadline": "2016-04-16T18:12:25.211Z",
    "expires": "2017-04-16T18:12:25.211Z",
    "scopes": [
        "docker-worker:cache:level-3-mozilla-inbound-tc-vcs",
        "docker-worker:cache:level-3-mozilla-inbound-dotcache"
    ],
    "payload": {
        "artifacts": {
            "public/build": {
                "expires": "2017-04-15T18:12:25.204913Z",
                "path": "/home/worker/artifacts/",
                "type": "directory"
            },
            "public/logs/": {
                "expires": "2017-04-15T18:12:25.211918Z",
                "path": "/home/worker/workspace/build/upload/logs/",
                "type": "directory"
            },
            "public/test_info/": {
                "expires": "2017-04-15T18:12:25.211990Z",
                "path": "/home/worker/workspace/build/blobber_upload_dir/",
                "type": "directory"
            }
        },
        "cache": {
            "level-3-mozilla-inbound-dotcache": "/home/worker/.cache",
            "level-3-mozilla-inbound-tc-vcs": "/home/worker/.tc-vcs"
        },
        "capabilities": {
            "devices": {
                "loopbackAudio": true,
                "loopbackVideo": true
            }
        },
        "command": [
            "bash",
            "/home/worker/bin/test.sh"
        ],
        "env": {
            "NEED_XVFB": true
        },
        "image": "taskcluster/dummyimage:latest",
        "maxRunTime": 7200
    },
    "metadata": {
        "description": "Dummy Task Description",
        "name": "[TC] Dummy Task",
        "owner": "dummy-taskcluster-tests@mozilla.com",
        "source": "https://github.com/taskcluster/taskcluster-treeherder"
    },
    "tags": {
        "createdForUser": "someuser@example.com"
    },
    "extra": {
        "chunks": {
            "current": 3,
            "total": 40
        },
        "treeherder": {
            "reason": "scheduled",
            "tier": 1,
            "jobKind": "build",
            "build": {
                "platform": "b2g-emu-x86-kk"
            },
            "collection": {
              "opt": true
            },
            "groupName": "Reftest",
            "groupSymbol": "tc-R",
            "machine": {
                "platform": "b2g-emu-x86-kk"
            },
            "productName": "b2g",
            "symbol": "R3"
        },
        "treeherderEnv": [
            "production",
            "staging"
        ]
    }
}`;

exports.taskDefinition = taskDefinition;
