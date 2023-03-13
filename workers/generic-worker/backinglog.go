package main

func (task *TaskRun) BackingLogName() string {
	if task.Payload.Logs.Backing == "" {
		return "public/logs/live_backing.log"
	}
	return task.Payload.Logs.Backing
}
