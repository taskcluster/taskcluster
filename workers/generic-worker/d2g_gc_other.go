//go:build !linux

package main

func removeD2GCacheFile() error {
	return nil
}

func dockerLowOnSpace() bool {
	return false
}

func waitForDockerContainerRemovals() {
}
