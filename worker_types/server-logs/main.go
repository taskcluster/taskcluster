package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

func main() {
	if len(os.Args) < 2 || len(os.Args) > 3 {
		log.Printf("Usage: %v TASK_ID [RUN_ID]", os.Args[0])
		log.Fatalf("Command specified: %v", shell.Escape(os.Args...))
	}
	taskID := os.Args[1]
	if slugid.Decode(taskID) == nil {
		log.Printf("Invalid taskID specified: %v", taskID)
		log.Fatal("Should match regular expression [A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]")
	}
	// -1 indicates "latest" task run - note, this is used internally, we don't allow -1 to be passed as a command parameter
	runID := -1
	if len(os.Args) == 3 {
		var err error
		runID, err = strconv.Atoi(os.Args[2])
		if err != nil || runID < 0 || runID > 5 {
			log.Printf("Usage: %v TASK_ID [RUN_ID]", os.Args[0])
			log.Printf("Command specified: %v", shell.Escape(os.Args...))
			log.Fatalf("RUN_ID must be an integer between 0 and 5, if specified. Value specified: %v", shell.Escape(os.Args[2]))
		}
	}
	q := tcqueue.NewFromEnv()
	tsr, err := q.Status(taskID)
	if err != nil {
		log.Fatalf("Could not retrieve task status information for task %v: %v", taskID, err)
	}
	if runID == -1 {
		runID = len(tsr.Status.Runs) - 1
	}
	if runID >= len(tsr.Status.Runs) {
		log.Printf("Usage: %v TASK_ID [RUN_ID]", os.Args[0])
		log.Printf("Command specified: %v", shell.Escape(os.Args...))
		log.Fatalf("Task %v does not have a run %v: highest available run ID is %v", taskID, runID, len(tsr.Status.Runs)-1)
	}
	workerID := tsr.Status.Runs[runID].WorkerID
	workerGroup := tsr.Status.Runs[runID].WorkerGroup
	workerType := tsr.Status.WorkerType
	system := ""
	switch workerGroup {
	case "mdc1":
		system = workerID + ".mdc1.mozilla.com-1"
	case "mdc2":
		system = workerID + ".mdc2.mozilla.com-1"
	case "eu-central-1":
		system = workerID + "." + workerType + ".euc1.mozilla.com"
	case "us-east-1":
		system = workerID + "." + workerType + ".use1.mozilla.com"
	case "us-east-2":
		system = workerID + "." + workerType + ".use2.mozilla.com"
	case "us-west-1":
		system = workerID + "." + workerType + ".usw1.mozilla.com"
	case "us-west-2":
		system = workerID + "." + workerType + ".usw2.mozilla.com"
	default:
		log.Fatalf("Unknown worker group: %v", workerGroup)
	}
	startedTime := tsr.Status.Runs[runID].Started
	resolvedTime := tsr.Status.Runs[runID].Resolved
	args := []string{"--force-color", "--system", system, "--min-time", startedTime.String(), "--max-time", resolvedTime.String()}
	cmd := exec.Command("papertrail", args...)
	fmt.Printf("Executing: papertrail %v\n", shell.Escape(args...))
	out, err := cmd.CombinedOutput()
	fmt.Println(string(out))
	if err != nil {
		log.Fatal(err)
	}
}
