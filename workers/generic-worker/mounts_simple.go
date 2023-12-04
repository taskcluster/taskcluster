//go:build simple

package main

func makeFileReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}

func makeDirReadWritableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}

func makeDirUnreadableForTaskUser(taskMount *TaskMount, dir string) error {
	// No user separation
	return nil
}
