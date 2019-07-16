// +build darwin linux

package fileutil

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

// SecureFiles makes the current user/group the owner of all files in
// filepaths, with 0600 file permissions.
func SecureFiles(filepaths []string) (err error) {
	// Use /usr/bin/id rather than user.Current due to https://bugzil.la/1566159
	// Note, if we enabled CGO in builds, we could use user.Current, but for now
	// we've decided not to.
	uidBytes, err := exec.Command("/usr/bin/id", "-u").CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %v", uidBytes, err)
	}
	// Use /usr/bin/id rather than user.Current due to https://bugzil.la/1566159
	gidBytes, err := exec.Command("/usr/bin/id", "-g").CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %v", gidBytes, err)
	}
	uidString := strings.TrimSpace(string(uidBytes))
	uid, err := strconv.Atoi(uidString)
	if err != nil {
		return fmt.Errorf("Could not convert %v to an integer uid: %v", uidString, err)
	}
	gidString := strings.TrimSpace(string(gidBytes))
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
