package d2g_test

import (
	"encoding/json"
	"testing"

	"github.com/taskcluster/d2g"
	"github.com/taskcluster/d2g/dockerworker"
	"github.com/taskcluster/d2g/genericworker"
)

// TestDecisionTask tests that a sample Docker Worker decision task payload is converted to the expected
// sample Generic Worker task payload. It does not execute the decision task; it simply checks that the
// converted payload exactly matches the expected output (and thus may be liable to break).
func TestDecisionTask(t *testing.T) {

	// Taken from https://firefox-ci-tc.services.mozilla.com/tasks/XJZwMq2zRI6ZXs7KveM5GQ
	// See https://treeherder.mozilla.org/jobs?repo=mozilla-central&revision=ca2873779214f6109ffe1b23e1455350294ac325&selectedTaskRun=XJZwMq2zRI6ZXs7KveM5GQ.0
	// And https://docs.google.com/document/d/1QNfHVpxtzXAlLWqZNz3b5mvbQWOrtsWpvadJHiMNbRc/edit#

	rawDWPayload := json.RawMessage(`
	  {
	    "artifacts": {
	      "public": {
	        "expires": "2023-10-20T10:58:21.912Z",
	        "path": "/builds/worker/artifacts",
	        "type": "directory"
	      },
	      "public/docker-contexts": {
	        "expires": "2022-10-27T10:58:21.912Z",
	        "path": "/builds/worker/checkouts/gecko/docker-contexts",
	        "type": "directory"
	      }
	    },
	    "cache": {
	      "gecko-level-3-checkouts-sparse-v3": "/builds/worker/checkouts"
	    },
	    "command": [
	      "/builds/worker/bin/run-task",
	      "--gecko-checkout=/builds/worker/checkouts/gecko",
	      "--gecko-sparse-profile=build/sparse-profiles/taskgraph",
	      "--",
	      "bash",
	      "-cx",
	      "cd /builds/worker/checkouts/gecko && ln -s /builds/worker/artifacts artifacts && ./mach --log-no-times taskgraph decision --pushlog-id='40334' --pushdate='1666263365' --project='mozilla-central' --owner='ctuns@mozilla.com' --level='3' --tasks-for='hg-push' --repository-type=hg --base-repository=\"$GECKO_BASE_REPOSITORY\" --base-rev=\"$GECKO_BASE_REV\" --head-repository=\"$GECKO_HEAD_REPOSITORY\" --head-ref=\"$GECKO_HEAD_REF\" --head-rev=\"$GECKO_HEAD_REV\" \n"
	    ],
	    "env": {
	      "GECKO_BASE_REPOSITORY": "https://hg.mozilla.org/mozilla-unified",
	      "GECKO_BASE_REV": "330c69218a931b3504d44c867539ed6083521be5",
	      "GECKO_HEAD_REF": "ca2873779214f6109ffe1b23e1455350294ac325",
	      "GECKO_HEAD_REPOSITORY": "https://hg.mozilla.org/mozilla-central",
	      "GECKO_HEAD_REV": "ca2873779214f6109ffe1b23e1455350294ac325",
	      "HG_STORE_PATH": "/builds/worker/checkouts/hg-store",
	      "MOZ_AUTOMATION": "1",
	      "PYTHONDONTWRITEBYTECODE": "1",
	      "TASKCLUSTER_CACHES": "/builds/worker/checkouts"
	    },
	    "features": {
	      "chainOfTrust": true,
	      "taskclusterProxy": true
	    },
	    "capabilities": {
	      "privileged": true
	    },
	    "image": "mozillareleases/gecko_decision:4.0.0@sha256:9f69fe08c28e3cb3cc296451f0a2735df6e25d0e3c877ea735ef1b7f0b345b06",
	    "maxRunTime": 3600
	  }
	`)

	expectedRawGWPayload := json.RawMessage(`
	  {
	    "artifacts": [
	      {
	        "expires": "2023-10-20T10:58:21.912Z",
	        "name": "public",
	        "path": "artifact0",
	        "type": "directory"
	      },
	      {
	        "expires": "2022-10-27T10:58:21.912Z",
	        "name": "public/docker-contexts",
	        "path": "artifact1",
	        "type": "directory"
	      }
	    ],
	    "command": [
	      [
	        "bash",
	        "-cx",
	        "podman run --name taskcontainer --privileged -v \"$(pwd)/cache0:/builds/worker/checkouts\" --add-host=taskcluster:127.0.0.1 --net=host -e \"GECKO_BASE_REPOSITORY=https://hg.mozilla.org/mozilla-unified\" -e \"GECKO_BASE_REV=330c69218a931b3504d44c867539ed6083521be5\" -e \"GECKO_HEAD_REF=ca2873779214f6109ffe1b23e1455350294ac325\" -e \"GECKO_HEAD_REPOSITORY=https://hg.mozilla.org/mozilla-central\" -e \"GECKO_HEAD_REV=ca2873779214f6109ffe1b23e1455350294ac325\" -e \"HG_STORE_PATH=/builds/worker/checkouts/hg-store\" -e \"MOZ_AUTOMATION=1\" -e \"PYTHONDONTWRITEBYTECODE=1\" -e \"RUN_ID=${RUN_ID}\" -e \"TASKCLUSTER_CACHES=/builds/worker/checkouts\" -e \"TASKCLUSTER_PROXY_URL=${TASKCLUSTER_PROXY_URL}\" -e \"TASKCLUSTER_ROOT_URL=${TASKCLUSTER_ROOT_URL}\" -e \"TASKCLUSTER_WORKER_LOCATION=${TASKCLUSTER_WORKER_LOCATION}\" -e \"TASK_ID=${TASK_ID}\" 'mozillareleases/gecko_decision:4.0.0@sha256:9f69fe08c28e3cb3cc296451f0a2735df6e25d0e3c877ea735ef1b7f0b345b06' /builds/worker/bin/run-task --gecko-checkout=/builds/worker/checkouts/gecko --gecko-sparse-profile=build/sparse-profiles/taskgraph -- bash -cx 'cd /builds/worker/checkouts/gecko \u0026\u0026 ln -s /builds/worker/artifacts artifacts \u0026\u0026 ./mach --log-no-times taskgraph decision --pushlog-id='\\''40334'\\'' --pushdate='\\''1666263365'\\'' --project='\\''mozilla-central'\\'' --owner='\\''ctuns@mozilla.com'\\'' --level='\\''3'\\'' --tasks-for='\\''hg-push'\\'' --repository-type=hg --base-repository=\"$GECKO_BASE_REPOSITORY\" --base-rev=\"$GECKO_BASE_REV\" --head-repository=\"$GECKO_HEAD_REPOSITORY\" --head-ref=\"$GECKO_HEAD_REF\" --head-rev=\"$GECKO_HEAD_REV\" \n'\nexit_code=$?\npodman cp 'taskcontainer:/builds/worker/artifacts' artifact0\npodman cp 'taskcontainer:/builds/worker/checkouts/gecko/docker-contexts' artifact1\npodman rm taskcontainer\nexit \"${exit_code}\""
	      ]
	    ],
	    "features": {
	      "chainOfTrust": true,
	      "taskclusterProxy": true
	    },
	    "maxRunTime": 3600,
	    "mounts": [
	      {
	        "cacheName": "gecko-level-3-checkouts-sparse-v3",
	        "directory": "cache0"
	      }
	    ],
	    "onExitStatus": {}
	  }
	`)

	var dwPayload dockerworker.DockerWorkerPayload
	err := json.Unmarshal(rawDWPayload, &dwPayload)

	if err != nil {
		t.Fatalf("Invalid json in test!\n%v\n%s", rawDWPayload, err)
	}

	var expectedGWPayload genericworker.GenericWorkerPayload
	err = json.Unmarshal(expectedRawGWPayload, &expectedGWPayload)

	if err != nil {
		t.Fatalf("Invalid json in test!\n%v\n%v", expectedRawGWPayload, err)
	}

	actualGWPayload, err := d2g.Convert(&dwPayload)
	if err != nil {
		t.Fatalf("Cannot convert Docker Worker payload %#v to Generic Worker payload: %s", dwPayload, err)
	}

	formattedActualGWPayload, err := json.MarshalIndent(*actualGWPayload, "", "  ")
	if err != nil {
		t.Fatalf("Cannot convert Generic Worker payload %#v to JSON: %s", *actualGWPayload, err)
	}
	formattedExpectedGWPayload, err := json.MarshalIndent(expectedGWPayload, "", "  ")
	if err != nil {
		t.Fatalf("Cannot convert Generic Worker payload %#v to JSON: %s", expectedGWPayload, err)
	}
	if string(formattedExpectedGWPayload) != string(formattedActualGWPayload) {
		t.Fatalf("Converted decision task does not match expected value.\nExpected:%v\nActual:%v", string(formattedExpectedGWPayload), string(formattedActualGWPayload))
	}
}
