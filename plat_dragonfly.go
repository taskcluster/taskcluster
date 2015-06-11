package main

func startup() error {
	debug("Detected Dragonfly platform")
	return nil
}

func (task *TaskRun) generateCommand(index int) (Command, error) {
	return task.unixCommand(task.Payload.Command[index])
}

func taskCleanup() error {
	return nil
}
