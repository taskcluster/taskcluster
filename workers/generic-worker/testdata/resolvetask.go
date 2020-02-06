package main

import (
	"log"
	"os"

	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

func main() {
	queue := tcqueue.New(tcclient.CredentialsFromEnvVars(), os.Getenv("TASKCLUSTER_ROOT_URL"))
	taskID := os.Getenv("TASK_ID")
	_, err := queue.CancelTask(taskID)
	if err != nil {
		log.Fatalf("Failed to cancel task: %v", err)
	}
	log.Printf("Cancelled task %v successfully", taskID)
}
