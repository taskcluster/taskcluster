package main

import "os"

func preservePreloadedOwnership(path string, info os.FileInfo) error {
	// Task mount setup assigns Windows ACLs to the task user.
	return nil
}
