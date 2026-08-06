package main

import (
	"fmt"
	"log"

	"github.com/taskcluster/taskcluster/v104/workers/generic-worker/host"
)

// A resource is something that can be deleted. Rating provides an indication
// of how "valuable" it is. A higher value means it should be preserved in
// favour of a resource with a lower rating.
type Resource interface {
	Rating() float64
	Evict(taskMount *TaskMount) error
}

// Resources is a type that can be sorted in order to establish in which order
// resources should be evicted.
type Resources []Resource

func (r Resources) Empty() bool {
	return len(r) == 0
}

// EvictNext evicts the next resource in deletion order and drops it from
// the list. It is dropped even if eviction failed, so that a caller which
// carries on after an error doesn't retry the same failing entry forever.
func (r *Resources) EvictNext() error {
	err := (*r)[0].Evict(nil)
	*r = (*r)[1:]
	return err
}

// Implement sort.Interface to sort by deletion order.
func (r Resources) Len() int {
	return len(r)
}

func (r Resources) Less(i, j int) bool {
	return r[i].Rating() < r[j].Rating()
}

func (r Resources) Swap(i, j int) {
	r[i], r[j] = r[j], r[i]
}

// runGarbageCollection frees disk space by evicting cached resources and,
// when no tasks are running, pruning unused Docker resources. It runs in
// the main loop goroutine between claim attempts.
//
// When tasksRunning is true, docker prune is skipped because it could
// remove images that a D2G task has loaded but not yet started a
// container for.
//
// It returns an error when a step it attempted failed.
//
// It should be independent of mounts feature, but let's go with it here
// as currently that is the only feature that uses it.
func runGarbageCollection(r Resources, tasksRunning bool) error {
	currentFreeSpace, err := freeDiskSpaceBytes(config.TasksDir)
	if err != nil {
		return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", config.TasksDir, err)
	}
	requiredFreeSpace := requiredSpaceBytes()

	if currentFreeSpace < requiredFreeSpace {
		log.Printf("Only %v bytes available in %v but %v required. Garbage collecting", currentFreeSpace, config.TasksDir, requiredFreeSpace)
	}

	if currentFreeSpace < requiredFreeSpace && config.D2GEnabled() && !tasksRunning {
		err := host.Run("docker", "volume", "prune", "--all", "--force")
		if err != nil {
			return fmt.Errorf("could not run docker volume prune to garbage collect due to error %#v", err)
		}

		currentFreeSpace, err = freeDiskSpaceBytes(config.TasksDir)
		if err != nil {
			return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", config.TasksDir, err)
		}
	}

	if currentFreeSpace < requiredFreeSpace && config.D2GEnabled() && !tasksRunning {
		err := host.Run("docker", "system", "prune", "--all", "--force")
		if err != nil {
			return fmt.Errorf("could not run docker system prune to garbage collect due to error %#v", err)
		}

		err = removeD2GCacheFile()
		if err != nil {
			return fmt.Errorf("could not remove d2g-image-cache.json due to error %#v", err)
		}

		currentFreeSpace, err = freeDiskSpaceBytes(config.TasksDir)
		if err != nil {
			return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", config.TasksDir, err)
		}
	}

	for currentFreeSpace < requiredFreeSpace {
		// need to free up space
		if r.Empty() {
			break
		}

		cacheMutex.Lock()
		evictErr := r.EvictNext()
		cacheMutex.Unlock()
		if evictErr != nil {
			log.Printf("WARNING: could not evict cache: %v", evictErr)
		}

		currentFreeSpace, err = freeDiskSpaceBytes(config.TasksDir)
		if err != nil {
			return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", config.TasksDir, err)
		}
	}

	return nil
}

func requiredSpaceBytes() uint64 {
	// note it used to be:
	// uint64(config.RequiredDiskSpaceMegabytes * 1024 * 1024)
	// but then it overflows on 32 bit systems
	return uint64(config.RequiredDiskSpaceMegabytes) * 1024 * 1024
}
