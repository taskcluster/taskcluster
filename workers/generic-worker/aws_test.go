package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/taskcluster/taskcluster/v37/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v37/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v37/workers/generic-worker/fileutil"
)

func TestNoWorkerTypeUserDataGenericWorkerProperty(t *testing.T) {
	test := GWTest(t)
	ec2 := test.MockEC2()
	ec2.WorkerConfig = map[string]interface{}{"foo": "bar"}
	err := test.Setup()
	defer test.Teardown()
	ExpectError(t, "No /userData/genericWorker object defined in worker type definition", err)
}

func TestNoPublicConfig(t *testing.T) {
	test := GWTest(t)
	ec2 := test.MockEC2()
	ec2.WorkerConfig = map[string]interface{}{
		"genericWorker": map[string]interface{}{
			"files": []fileutil.File{},
		},
	}
	err := test.Setup()
	defer test.Teardown()
	ExpectError(t, "No /userData/genericWorker/config object defined in worker type definition", err)
}

// Make sure that secret worker config in taskcluster-secrets isn't mandatory by not creating it
func TestNoWorkerTypeSecret(t *testing.T) {
	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets
	err := test.Setup()
	defer test.Teardown()
	ExpectNoError(t, err)
}

func TestSecretServiceError(t *testing.T) {
	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets
	// create bad config secret
	err := serviceFactory.Secrets(test.Config.Credentials(), test.Config.RootURL).Set(
		"worker-pool:"+test.Config.ProvisionerID+"/"+test.Config.WorkerType,
		&tcsecrets.Secret{
			Expires: inAnHour,
			Secret:  json.RawMessage(`{"SURPRISE": ".... oh, that's unexpected"}`),
		},
	)
	ExpectNoError(t, err)
	err = test.Setup()
	defer test.Teardown()
	ExpectError(t, `unknown field "SURPRISE"`, err)
}

func TestUnknownConfigInUserData(t *testing.T) {
	test := GWTest(t)
	ec2 := test.MockEC2()
	ec2.WorkerConfig["genericWorker"].(map[string]interface{})["config"] = map[string]interface{}{
		"nosuchthing": "this-shouldn't-he-here",
	}
	err := test.Setup()
	defer test.Teardown()
	ExpectError(t, "json: unknown field", err)
}

func TestPublicConfigInWorkerTypeSecret(t *testing.T) {
	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets
	err := serviceFactory.Secrets(test.Config.Credentials(), test.Config.RootURL).Set(
		"worker-pool:"+test.Config.ProvisionerID+"/"+test.Config.WorkerType,
		&tcsecrets.Secret{
			Expires: inAnHour,
			Secret: json.RawMessage(`{
				"config": {
					"workerGroup": "12345"
				}
			}`),
		},
	)
	ExpectNoError(t, err)
	err = test.Setup()
	defer test.Teardown()
	ExpectError(t, `unknown field "workerGroup"`, err)
}

func TestAdditionalPropertyUnderWorkerTypeDefinitionUserDataGenericWorkerProperty(t *testing.T) {
	test := GWTest(t)
	ec2 := test.MockEC2()
	ec2.WorkerConfig["genericWorker"].(map[string]interface{})["whoops"] = 123
	err := test.Setup()
	defer test.Teardown()
	ExpectError(t, "json: unknown field", err)
}

func TestInvalidWorkerTypeDefinitionFiles(t *testing.T) {
	test := GWTest(t)
	ec2 := test.MockEC2()
	ec2.WorkerConfig["genericWorker"].(map[string]interface{})["files"] = 123
	err := test.Setup()
	defer test.Teardown()
	ExpectError(t, "json: cannot unmarshal number into Go struct field", err)
}

func TestAdditionalFieldInWorkerTypeSecret(t *testing.T) {
	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets

	nothingSpecialFile := filepath.Join(testdataDir, t.Name(), "nothing-special.txt")

	err := serviceFactory.Secrets(test.Config.Credentials(), test.Config.RootURL).Set(
		"worker-pool:"+test.Config.ProvisionerID+"/"+test.Config.WorkerType,
		&tcsecrets.Secret{
			Expires: inAnHour,
			Secret: json.RawMessage(fmt.Sprintf(`{
				"config": {
					"accessToken": "12345"
				},
				"files": [
					{
						"content":     "cHJldGVuZCBjZXJ0Cg==",
						"description": "Unimportant file",
						"encoding":    "base64",
						"format":      "file",
						"path":        %q
					}
				],
				"additionalField": "this-shouldn't-be-here"
			}`, nothingSpecialFile)),
		},
	)
	ExpectNoError(t, err)
	err = test.Setup()
	defer test.Teardown()
	ExpectError(t, "json: unknown field", err)
}

func TestNoShutdown(t *testing.T) {
	test := GWTest(t)
	ec2 := test.MockEC2() // fetch config from worker manager / taskcluster secrets
	ec2.Terminating = false
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
		Command:    sleep(10),
		MaxRunTime: 8,
	}
	td := testTask(t)
	_ = submitAndAssert(t, td, payload, "failed", "failed")
}

func TestAWSWorkerTypeMetadata(t *testing.T) {

	expectedMetadata := "My value was configured in worker manager"

	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets
	wm := serviceFactory.WorkerManager(nil, "http://localhost:13243")
	_, err := wm.CreateWorkerPool(
		test.Config.ProvisionerID+"/"+test.Config.WorkerType,
		&tcworkermanager.WorkerPoolDefinition{
			Config: json.RawMessage(`{
				"launchConfigs": [
					{
						"workerConfig": {
							"genericWorker": {
								"config": {
									"deploymentId": "crumpets4tea"
								}
							}
						}
					}
				]
			}`),
		},
	)
	ExpectNoError(t, err)
	test.Config.WorkerTypeMetadata["machine-setup"] = map[string]string{"pretend-metadata": expectedMetadata}
	err = test.Setup()
	defer test.Teardown()
	ExpectNoError(t, err)

	md := config.WorkerTypeMetadata
	machineSetup := md["machine-setup"].(map[string]interface{})
	actualMetadata := machineSetup["pretend-metadata"].(string)
	if actualMetadata != expectedMetadata {
		t.Fatalf("Was expecting pretend metadata '%v' but got '%v'", expectedMetadata, actualMetadata)
	}
	expectedWorkerLocation := `{"cloud":"aws","region":"quadrant-4","availabilityZone":"outer-space"}`
	actualWorkerLocation := config.WorkerLocation
	if actualWorkerLocation != expectedWorkerLocation {
		t.Fatalf("Was expecting worker location %q but got %q", expectedWorkerLocation, actualWorkerLocation)
	}
}

func TestPrivateFileExtraction(t *testing.T) {
	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets

	nothingSpecialFile := filepath.Join(testdataDir, t.Name(), "nothing-special.txt")
	importandDocsDir := filepath.Join(testdataDir, t.Name(), "important-docs")

	// create valid secret
	err := serviceFactory.Secrets(test.Config.Credentials(), test.Config.RootURL).Set(
		"worker-pool:"+test.Config.ProvisionerID+"/"+test.Config.WorkerType,
		&tcsecrets.Secret{
			Expires: inAnHour,
			Secret: json.RawMessage(fmt.Sprintf(`{
				"config": {
					"accessToken": "12345"
				},
				"files": [
					{
						"content":     "cHJldGVuZCBjZXJ0Cg==",
						"description": "Unimportant file",
						"encoding":    "base64",
						"format":      "file",
						"path":        %q
					},
					{
						"content":     "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",
						"description": "Important zip file",
						"encoding":    "base64",
						"format":      "zip",
						"path":        %q
					}
				]
			}`, nothingSpecialFile, importandDocsDir)),
		},
	)
	ExpectNoError(t, err)
	err = test.Setup()
	defer test.Teardown()
	ExpectNoError(t, err)
	checkSHA256OfFile(t, nothingSpecialFile, "b874e6c45ab0a910095b9580f7a4955c33d153afb8ad3ae6e04b30daaa3d9d34")
	checkSHA256OfFile(t, filepath.Join(importandDocsDir, "mydad.svg"), "7a8402876469a063097fb1241462bf0adf456c5e5863def3850e9eb1d4fa1734")
	if config.AccessToken != "12345" {
		t.Fatalf(`Was expecting access token to be "12345" but it was %q`, config.AccessToken)
	}
}

func TestDeploymentIDUpdated(t *testing.T) {
	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets
	err := test.Setup()
	defer test.Teardown()
	ExpectNoError(t, err)
	config.DeploymentID = "oldDeploymentID"
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
									"deploymentId": "newDeploymentID"
								}
							}
						}
					}
				]
			}`),
		},
	)
	ExpectNoError(t, err)

	if !deploymentIDUpdated() {
		t.Fatalf("Was expecting deploymentIDUpdated() function to see that deployment ID was updated")
	}
}

func TestDeploymentIDNotUpdated(t *testing.T) {
	test := GWTest(t)
	_ = test.MockEC2() // fetch config from worker manager / taskcluster secrets
	err := test.Setup()
	defer test.Teardown()
	ExpectNoError(t, err)
	config.DeploymentID = "oldDeploymentID"
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
									"deploymentId": "oldDeploymentID"
								}
							}
						}
					}
				]
			}`),
		},
	)
	ExpectNoError(t, err)

	if deploymentIDUpdated() {
		t.Fatalf("Was expecting deploymentIDUpdated() function to see that deployment ID was not updated")
	}
}
