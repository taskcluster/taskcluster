package main

func startup() error {
	debug("Detected Plan 9 platform")
	return nil
}

func (task *TaskRun) generateCommand(index int) (Command, error) {
	return task.unixCommand(task.Payload.Command[index])
}

func taskCleanup() error {
	return nil
}

func install(arguments map[string]interface{}) (err error) {
	return nil
}
