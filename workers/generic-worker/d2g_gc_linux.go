//go:build linux

package main

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v113/workers/generic-worker/host"
)

var (
	// dockerRootDir is the docker data-root, which may be on a different
	// filesystem than the tasks directory.
	dockerRootDir       string
	dockerRootDirLookup time.Time
)

// removeD2GCacheFile safely removes the d2g-image-cache.json file
// with mutex protection for concurrent task execution (capacity > 1)
func removeD2GCacheFile() error {
	d2gCacheMutex.Lock()
	defer d2gCacheMutex.Unlock()
	err := os.Remove("d2g-image-cache.json")
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func dockerLowOnSpace() bool {
	// Retry, since the docker daemon may not have been running yet.
	if dockerRootDir == "" && time.Since(dockerRootDirLookup) >= time.Minute {
		dockerRootDirLookup = time.Now()
		out, err := host.Output("docker", "info", "--format", "{{.DockerRootDir}}")
		if err != nil {
			log.Printf("WARNING: could not determine docker data-root, so measuring free disk space for docker in %v instead: %v", config.TasksDir, err)
		}
		dockerRootDir = strings.TrimSpace(out)
	}
	dir, requiredFreeSpace := config.TasksDir, requiredSpaceBytes()
	if dockerRootDir != "" {
		dir = dockerRootDir
		if config.RequiredDockerDiskSpaceMegabytes != 0 {
			requiredFreeSpace = uint64(config.RequiredDockerDiskSpaceMegabytes) * 1024 * 1024
		}
	}
	freeSpace, err := freeDiskSpaceBytes(dir)
	if err != nil {
		log.Printf("WARNING: could not calculate free disk space in dir %v due to error %#v", dir, err)
		return false
	}
	if freeSpace < requiredFreeSpace {
		waitForDockerContainerRemovals()
		freeSpace, err = freeDiskSpaceBytes(dir)
		if err != nil {
			log.Printf("WARNING: could not calculate free disk space in dir %v due to error %#v", dir, err)
			return false
		}
	}
	if freeSpace < requiredFreeSpace {
		log.Printf("Only %v bytes available in %v but %v required. Pruning docker resources", freeSpace, dir, requiredFreeSpace)
		return true
	}
	return false
}

func waitForDockerContainerRemovals() {
	dockerContainerRemovals.Wait()
}
