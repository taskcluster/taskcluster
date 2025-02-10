//go:build multiuser

package main

import (
	"fmt"
	"os"

	"github.com/taskcluster/taskcluster/v80/workers/generic-worker/host"
	gwruntime "github.com/taskcluster/taskcluster/v80/workers/generic-worker/runtime"
)

func defaultTasksDir() string {
	return "/home"
}

func platformFeatures() []Feature {
	return []Feature{
		&InteractiveFeature{},
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
		&RunTaskAsCurrentUserFeature{},
		// keep chain of trust as low down as possible, as it checks permissions
		// of signing key file, and a feature could change them, so we want these
		// checks as late as possible
		&ChainOfTrustFeature{},
	}
}

func makeDirUnreadableForUser(dir string, user *gwruntime.OSUser) error {
	// Note, only need to set top directory, not recursively, since without
	// access to top directory, nothing inside can be read anyway
	err := host.Run("/bin/chown", "0:0", dir)
	if err != nil {
		return fmt.Errorf("[mounts] Not able to make directory %v owned by root/root in order to prevent %v from having access: %v", dir, user.Name, err)
	}
	return os.Chmod(dir, 0700)
}
