package main

import (
	"log"
	"os"

	"github.com/taskcluster/taskcluster-client-go/tcqueue"
)

func main() {
	queue := tcqueue.NewFromEnv()
	taskID := os.Getenv("TASK_ID")
	_, err := queue.CancelTask(taskID)
	if err != nil {
		log.Fatalf("Failed to cancel task: %v", err)
	}
	log.Printf("Cancelled task %v successfully", taskID)
}
