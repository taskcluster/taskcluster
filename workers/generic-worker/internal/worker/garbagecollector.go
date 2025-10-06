package worker

import (
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/host"
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

func (r *Resources) EvictNext() error {
	err := (*r)[0].Evict(nil)
	if err != nil {
		return err
	}
	*r = (*r)[1:]
	return nil
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

// Note ideally this would run in an independent thread, but since we have one
// job at a time, we can sequence it between task runs. Also it should be
// independent of mounts feature, but let's go with it here as currently that
// is the only feature that uses it.
func runGarbageCollection(r Resources) error {
	currentFreeSpace, err := freeDiskSpaceBytes(taskContext.TaskDir)
	if err != nil {
		return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", taskContext.TaskDir, err)
	}
	requiredFreeSpace := requiredSpaceBytes()
	for currentFreeSpace < requiredFreeSpace {
		// need to free up space
		if r.Empty() {
			break
		}
		err = r.EvictNext()
		if err != nil {
			return err
		}
		currentFreeSpace, err = freeDiskSpaceBytes(taskContext.TaskDir)
		if err != nil {
			return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", taskContext.TaskDir, err)
		}
	}
	if currentFreeSpace < requiredFreeSpace {
		if config.D2GEnabled() {
			err := host.Run("docker", "image", "prune", "--all", "--force")
			if err != nil {
				return fmt.Errorf("could not run docker image prune to garbage collect due to error %#v", err)
			}
			err = os.Remove("d2g-image-cache.json")
			if err != nil {
				return fmt.Errorf("could not remove d2g-image-cache.json due to error %#v", err)
			}
			currentFreeSpace, err = freeDiskSpaceBytes(taskContext.TaskDir)
			if err != nil {
				return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", taskContext.TaskDir, err)
			}
		}
	}
	if currentFreeSpace < requiredFreeSpace {
		return fmt.Errorf("not able to free up enough disk space - require %v bytes, but only have %v bytes - and nothing left to delete", requiredFreeSpace, currentFreeSpace)
	}
	return nil
}

func requiredSpaceBytes() uint64 {
	// note it used to be:
	// uint64(config.RequiredDiskSpaceMegabytes * 1024 * 1024)
	// but then it overflows on 32 bit systems
	return uint64(config.RequiredDiskSpaceMegabytes) * 1024 * 1024
}
