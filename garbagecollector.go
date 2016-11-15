package main

import "fmt"

// A resource is something that can be deleted. Rating provides an indication
// of how "valuable" it is. A higher value means it should be preserved in
// favour of a resource with a lower rating.
type Resource interface {
	Rating() float64
	Expunge() error
}

// Resources is a type that can be sorted in order to establish in which order
// resources should be expunged.
type Resources []Resource

func (r Resources) Empty() bool {
	return len(r) == 0
}

func (r *Resources) ExpungeNext() error {
	err := (*r)[0].Expunge()
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
	currentFreeSpace, err := freeDiskSpaceBytes(TaskUser.TaskDir)
	if err != nil {
		return fmt.Errorf("Could not calculate free disk space in dir %v due to error %#v", TaskUser.TaskDir, err)
	}
	requiredFreeSpace := requiredSpaceBytes()
	for currentFreeSpace < requiredFreeSpace {
		// need to free up space
		if r.Empty() {
			break
		}
		err = r.ExpungeNext()
		if err != nil {
			return err
		}
		currentFreeSpace, err = freeDiskSpaceBytes(TaskUser.TaskDir)
		if err != nil {
			return err
		}
	}
	if currentFreeSpace < requiredFreeSpace {
		return fmt.Errorf("Not able to free up enough disk space - require %v bytes, but only have %v bytes - and nothing left to delete.", requiredFreeSpace, currentFreeSpace)
	}
	return nil
}

func requiredSpaceBytes() uint64 {
	// note it used to be:
	// uint64(config.RequiredDiskSpaceMegabytes * 1024 * 1024)
	// but then it overflows on 32 bit systems
	return uint64(config.RequiredDiskSpaceMegabytes) * 1024 * 1024
}
