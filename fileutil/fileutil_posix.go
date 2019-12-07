// +build darwin linux

package fileutil

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/taskcluster/generic-worker/host"
)

// SecureFiles makes the current user/group the owner of all files in
// filepaths, with 0600 file permissions.
func SecureFiles(filepaths ...string) (err error) {
	// Use /usr/bin/id rather than user.Current due to https://bugzil.la/1566159
	// Note, if we enabled CGO in builds, we could use user.Current, but for now
	// we've decided not to.
	uidString, err := host.CombinedOutput("/usr/bin/id", "-u")
	if err != nil {
		return err
	}
	// Use /usr/bin/id rather than user.Current due to https://bugzil.la/1566159
	gidString, err := host.CombinedOutput("/usr/bin/id", "-g")
	if err != nil {
		return err
	}
	uidString = strings.TrimSpace(uidString)
	uid, err := strconv.Atoi(uidString)
	if err != nil {
		return fmt.Errorf("Could not convert %v to an integer uid: %v", uidString, err)
	}
	gidString = strings.TrimSpace(gidString)
	gid, err := strconv.Atoi(gidString)
	if err != nil {
		return fmt.Errorf("Could not convert %v to an integer gid: %v", gidString, err)
	}
	for _, path := range filepaths {
		err = os.Chown(
			path,
			uid,
			gid,
		)
		if err != nil {
			return fmt.Errorf("Could not change owner/group of %v to %v/%v: %v", path, uid, gid, err)
		}
		err = os.Chmod(
			path,
			0600,
		)
		if err != nil {
			return fmt.Errorf("Could not change file permissions of %v to 0600: %v", path, err)
		}
	}
	return nil
}
