package metrics

import (
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// WorkerConfig contains worker identification information needed for metrics
type WorkerConfig struct {
	ProvisionerID string
	WorkerType    string
	WorkerID      string
	Region        string
	InstanceType  string
}

// TaskInfo contains task-specific information for metrics
type TaskInfo struct {
	TaskID string
	RunID  uint
}

// LogEvent logs a worker metrics event with the given event type and optional task information
func LogEvent(eventType string, workerConfig WorkerConfig, taskInfo *TaskInfo, timestamp time.Time) {
	fields := map[string]any{
		"eventType":    eventType,
		"worker":       "generic-worker",
		"workerPoolId": fmt.Sprintf("%s/%s", workerConfig.ProvisionerID, workerConfig.WorkerType),
		"workerId":     workerConfig.WorkerID,
		"timestamp":    timestamp.Unix(),
		"region":       workerConfig.Region,
		"instanceType": workerConfig.InstanceType,
	}

	if taskInfo != nil {
		fields["taskId"] = taskInfo.TaskID
		fields["runId"] = taskInfo.RunID
	}

	j, err := json.Marshal(fields)
	if err != nil {
		log.Printf("Error encoding working metrics: %v", err)
		return
	}

	log.Printf("WORKER_METRICS %s", j)
}
