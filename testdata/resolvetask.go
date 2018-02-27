package main

import (
	"log"
	"os"

	"github.com/taskcluster/taskcluster-client-go/queue"
)

func main() {
	myQueue, err := queue.New(nil)
	if err != nil {
		log.Fatalf("Invalid taskcluster credentials in environment variables: %v", err)
	}
	taskID := os.Getenv("TASK_ID")
	_, err = myQueue.CancelTask(taskID)
	if err != nil {
		log.Fatalf("Failed to cancel task: %v", err)
	}
	log.Printf("Cancelled task %v successfully", taskID)
}
