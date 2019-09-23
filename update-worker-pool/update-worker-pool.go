package main

import (
	"io/ioutil"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcworkermanager"
)

func gitRevision(dir string) string {
	command := exec.Command("git", "rev-parse", "HEAD")
	command.Dir = dir
	output, err := command.Output()
	if err != nil {
		panic(err)
	}
	return string(output[:len(output)-1])
}

func main() {
	if len(os.Args) != 2 {
		log.Fatal("Usage: " + os.Args[0] + " WORKER_TYPE_DIRECTORY")
	}
	workerTypeDir := os.Args[1]
	absFile, err := filepath.Abs(workerTypeDir)
	if err != nil {
		log.Fatalf("File/directory '%v' could not be read due to '%s'", workerTypeDir, err)
	}

	workerType := filepath.Base(absFile)
	workerPoolId := os.Getenv("PROVISIONER_ID") + "/" + workerType

	files, err := ioutil.ReadDir(workerTypeDir)
	if err != nil {
		log.Fatalf("File/directory '%v' (%v) could not be read due to '%s'", workerTypeDir, absFile, err)
	}

	scriptName := ""
	for _, f := range files {
		if !f.IsDir() && strings.HasPrefix(f.Name(), "bootstrap.") {
			scriptName = f.Name()
		}
	}

	workerManager := tcworkermanager.NewFromEnv()
	cdv := tcclient.Client(*workerManager)
	cd := &cdv

	var wt map[string]interface{}
	_, _, err = cd.APICall(nil, "GET", "/worker-pool/"+url.QueryEscape(workerPoolId), &wt, nil)
	if err != nil {
		log.Fatal(err)
	}
	workerPoolConfig := wt["config"].(map[string]interface{})
	disks := workerPoolConfig["disks"].([]interface{})

	delete(wt, "workerPoolId")
	delete(wt, "created")
	delete(wt, "lastModified")

	diskObj := disks[0].(map[string]interface{})
	initializeParams := diskObj["initializeParams"].(map[string]interface{})
	oldImage := initializeParams["sourceImage"].(string)
	newImage := "projects/pmoore-dev/global/images/" + os.Getenv("UNIQUE_NAME")
	log.Print("Old image: " + oldImage)
	log.Print("New image: " + newImage)
	initializeParams["sourceImage"] = newImage
	if oldImage == newImage {
		log.Print("WARNING: No change to image (" + oldImage + ")")
	} else {
		log.Print("Worker pool " + workerPoolId + " updated to use image " + newImage)
	}

	userDataMap := workerPoolConfig["workerConfig"].(map[string]interface{})
	genericWorker := userDataMap["genericWorker"].(map[string]interface{})
	config := genericWorker["config"].(map[string]interface{})
	oldDeploymentID := config["deploymentId"].(string)
	newDeploymentID := slugid.Nice()
	config["deploymentId"] = newDeploymentID
	log.Print("Old deployment ID: " + oldDeploymentID)
	log.Print("New deployment ID: " + newDeploymentID)
	oldMetadata := config["workerTypeMetadata"].(map[string]interface{})
	oldMachineSetup := oldMetadata["machine-setup"].(map[string]interface{})
	oldScript := oldMachineSetup["script"].(string)
	newScript := "https://raw.githubusercontent.com/taskcluster/generic-worker/" + gitRevision(workerTypeDir) + "/worker_types/" + workerType + "/" + scriptName
	oldMachineSetup["script"] = newScript

	log.Print("Old machine setup script: " + oldScript)
	log.Print("New machine setup script: " + newScript)

	_, _, err = cd.APICall(wt, "POST", "/worker-pool/"+url.QueryEscape(workerPoolId), new(interface{}), nil)
	if err != nil {
		log.Fatal(err)
	}
}
