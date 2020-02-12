// +build simple docker

package main

func makeFileReadWritableForTaskUser(task *TaskRun, dir string) error {
	// No user separation
	return nil
}

func makeDirReadWritableForTaskUser(task *TaskRun, dir string) error {
	// No user separation
	return nil
}

func makeDirUnreadableForTaskUser(task *TaskRun, dir string) error {
	// No user separation
	return nil
}
