// +build !windows

package fileutil

import (
	"os"
	"os/user"
	"strconv"
)

// SecureFiles takes ownership of files, and then give them 0600 file permissions
func SecureFiles(filepaths []string) (err error) {
	var currentUser *user.User
	currentUser, err = user.Current()
	if err != nil {
		return err
	}
	var uid, gid int
	uid, err = strconv.Atoi(currentUser.Uid)
	if err != nil {
		return err
	}
	gid, err = strconv.Atoi(currentUser.Gid)
	if err != nil {
		return err
	}
	for _, path := range filepaths {
		err = os.Chown(
			path,
			uid,
			gid,
		)
		if err != nil {
			return err
		}
		err = os.Chmod(
			path,
			0600,
		)
		if err != nil {
			return err
		}
	}
	return err
}
