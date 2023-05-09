//go:build linux || darwin || freebsd

package perms

import (
	"fmt"
	"os"
	"syscall"
)

// Make a private file that is only readable by the current user.
func WritePrivateFile(filename string, content []byte) error {
	if filename == "" {
		// regression check for
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1594353
		panic("empty filename passed to WritePrivateFile")
	}

	// remove any existing file if it already exists, ignoring errors
	_ = os.Remove(filename)

	// 0600 permissions actually mean what they say on POSIX (unlike Windows)
	err := os.WriteFile(filename, content, 0600)
	if err != nil {
		return fmt.Errorf("Could not write to %s: %w", filename, err)
	}

	return verifyPrivateToOwner(filename)
}

// Read a file, first verifying that it can only be read by the current user.
func ReadPrivateFile(filename string) ([]byte, error) {
	err := verifyPrivateToOwner(filename)
	if err != nil {
		return []byte{}, err
	}

	return os.ReadFile(filename)
}

// verifyPrivateToOwner verifies that the given file can only be read by the
// file's owner, returning an error if this is not the case, or cannot be
// determined.  Returns an error satisfying os.IsNotExist when the file does
// not exist.
func verifyPrivateToOwner(filename string) error {
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
