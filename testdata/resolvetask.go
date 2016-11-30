package main

import (
	"log"
	"os"

	"github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/queue"
)

func main() {
	myQueue := queue.New(
		&tcclient.Credentials{
			ClientID:    os.Getenv("TASKCLUSTER_CLIENT_ID"),
			AccessToken: os.Getenv("TASKCLUSTER_ACCESS_TOKEN"),
			Certificate: os.Getenv("TASKCLUSTER_CERTIFICATE"),
		},
	)
	taskID := os.Getenv("TASK_ID")
	_, err := myQueue.CancelTask(taskID)
	if err != nil {
		log.Fatal("Failed to cancel task: %v", err)
	}
	log.Printf("Cancelled task %v successfully", taskID)
}
