// +build linux darwin

package perms

import (
	"fmt"
	"os"
	"syscall"
)

// MakePrivateToOwner ensures that the given file is private to the
// file owner.
func MakePrivateToOwner(filename string) (err error) {
	if filename == "" {
		// regression check for
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1594353
		panic("empty filename passed to MakePrivateToOwner")
	}

	stat, err := os.Stat(filename)
	if err != nil {
		return err
	}

	uid := int(stat.Sys().(*syscall.Stat_t).Uid)
	if uid != os.Getuid() {
		err = os.Chown(filename, os.Getuid(), -1)
		if err != nil {
			return err
		}
	}

	err = os.Chmod(filename, 0600)
	return
}

// VerifyPrivateToOwner verifies that the given file can only be read by the
// file's owner, returning an error if this is not the case, or cannot be
// determined.
func VerifyPrivateToOwner(filename string) error {
	stat, err := os.Stat(filename)
	if err != nil {
		return err
	}

	uid := int(stat.Sys().(*syscall.Stat_t).Uid)
	if uid != os.Getuid() {
		return fmt.Errorf("%s has incorrect owner id %d", filename, uid)
	}
	// (note: we don't check gid since the group has no permission to the file)

	if stat.Mode() != os.FileMode(0600) {
		return fmt.Errorf("%s has mode %#o, not 0600", filename, stat.Mode())
	}
	return nil
}
