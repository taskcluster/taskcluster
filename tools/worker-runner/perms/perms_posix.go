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
		return fmt.Errorf("could not write to %s: %w", filename, err)
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
// not exist.  A file is considered private if no group or other permission
// bits are set AND the owner-read bit is set (e.g. 0400, 0500, 0600, 0700);
// operators who deliberately tighten permissions beyond 0600 should not be
// forced to loosen them, but an owner-unreadable config (e.g. 0200) is
// treated as a provisioning error because worker-runner must be able to
// read the file.
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

	perm := stat.Mode().Perm()
	if perm&0o077 != 0 {
		return fmt.Errorf("%s has mode %#o; must not be group- or other-accessible", filename, perm)
	}
	if perm&0o400 == 0 {
		return fmt.Errorf("%s has mode %#o; owner-read bit must be set", filename, perm)
	}
	return nil
}

// MakeFilePrivate ensures that the given file is accessible only by its
// owner. A file is considered already private if no group or other bits are
// set in its mode (e.g. 0600, 0400, 0500); in that case this is a no-op and
// the returned bool is false. If the file had looser permissions, they are
// tightened to 0600 and the returned bool is true. An error is returned if
// the file cannot be opened, if it is not a regular file, if chmod is
// required but the file is owned by a different user, or if chmod fails.
//
// The file is opened with O_NOFOLLOW and subsequent stat/chmod operations
// use the file descriptor rather than the path, to close the TOCTOU window
// where the path could be replaced between operations. O_NONBLOCK prevents
// a FIFO planted at the config path from blocking the open indefinitely;
// the regular-file check below then rejects it.
func MakeFilePrivate(filename string) (bool, error) {
	f, err := os.OpenFile(filename, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return false, err
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return false, err
	}

	// Refuse FIFOs, devices, sockets, and anything else that isn't a plain
	// regular file. Without this check, a FIFO with 0600 perm bits would
	// pass as "private" and worker-runner would then block reading from it
	// (or return whatever a device file produces).
	if !stat.Mode().IsRegular() {
		return false, fmt.Errorf("%s is not a regular file (mode %v)", filename, stat.Mode())
	}

	perm := stat.Mode().Perm()

	// Refuse owner-unreadable modes (e.g. 0200, 0300) even if they have no
	// group/other bits set. Worker-runner must be able to read the file, so
	// this is a provisioning error; silently widening to 0600 would mask
	// the mistake.
	if perm&0o400 == 0 {
		return false, fmt.Errorf("%s has mode %#o; owner-read bit must be set", filename, perm)
	}

	// Already private if no group/other bits are set (e.g. 0600, 0400, 0500).
	// This path doesn't need to modify the file, so we accept it regardless
	// of who owns it; a file we don't own at 0400 is still private.
	if perm&0o077 == 0 {
		return false, nil
	}

	// Past this point we need to chmod, which requires ownership.
	uid := int(stat.Sys().(*syscall.Stat_t).Uid)
	if uid != os.Getuid() {
		return false, fmt.Errorf("%s has incorrect owner id %d (expected %d); refusing to tighten permissions on a file owned by another user", filename, uid, os.Getuid())
	}

	if err := f.Chmod(0600); err != nil {
		return false, fmt.Errorf("could not chmod %s to 0600: %w", filename, err)
	}

	return true, nil
}
