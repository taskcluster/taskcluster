package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"
)

func logEvent(eventType string, task *TaskRun, timestamp time.Time) {
	fields := map[string]interface{}{
		"eventType":    eventType,
		"worker":       "generic-worker",
		"workerPoolId": fmt.Sprintf("%s/%s", config.ProvisionerID, config.WorkerType),
		"workerId":     config.WorkerID,
		"timestamp":    timestamp.Unix(),
		"region":       config.Region,
		"instanceType": config.InstanceType,
	}

	if task != nil {
		fields["taskId"] = task.TaskID
		fields["runId"] = task.RunID
	}

	j, err := json.Marshal(fields)
	if err != nil {
		log.Printf("Error encoding working metrics: %v", err)
		return
	}

	log.Printf("WORKER_METRICS %s", j)
}
