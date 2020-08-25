// +build !docker

package main

import (
	"encoding/json"
	"testing"

	"github.com/taskcluster/taskcluster/v37/clients/client-go/tcworkermanager"
)

func TestWorkerShutdown(t *testing.T) {
	test := GWTest(t)
	ec2 := test.MockEC2() // fetch config from worker manager / taskcluster secrets
	ec2.Terminating = true
	err := test.Setup()
	defer test.Teardown()
	ExpectNoError(t, err)
	wm := serviceFactory.WorkerManager(nil, "http://localhost:13243")
	_, err = wm.CreateWorkerPool(
		test.Config.ProvisionerID+"/"+test.Config.WorkerType,
		&tcworkermanager.WorkerPoolDefinition{
			Config: json.RawMessage(`{
				"launchConfigs": [
					{
						"workerConfig": {
							"genericWorker": {
								"config": {
									"deploymentId": "` + test.Config.DeploymentID + `"
								}
							}
						}
					}
				]
			}`),
		},
	)
	ExpectNoError(t, err)
	payload := GenericWorkerPayload{
		Command:    sleep(20),
		MaxRunTime: 15,
	}
	td := testTask(t)
	_ = submitAndAssert(t, td, payload, "exception", "worker-shutdown")
}
