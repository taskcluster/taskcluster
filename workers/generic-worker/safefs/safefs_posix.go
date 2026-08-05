//go:build darwin || linux || freebsd

package safefs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

const maxTrustedLinks = 8

const dirFlags = unix.O_RDONLY | unix.O_DIRECTORY | unix.O_NOFOLLOW | unix.O_CLOEXEC

func splitAbsPath(path string) ([]string, error) {
	if path == "" {
		return nil, errors.New("refusing to operate on an empty path")
	}

	separator := func(r rune) bool { return r == '/' }

	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("could not resolve %q: %w", path, err)
	}

	return strings.FieldsFunc(abs, separator), nil
}

func isSymlinkAt(dirfd int, name string) bool {
	var st unix.Stat_t
	if err := unix.Fstatat(dirfd, name, &st, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		return false
	}
	return st.Mode&unix.S_IFMT == unix.S_IFLNK
}

func onlyRootCanWrite(dirfd int) bool {
	var st unix.Stat_t
	if err := unix.Fstat(dirfd, &st); err != nil {
		return false
	}
	return st.Uid == 0 && st.Mode&(unix.S_IWGRP|unix.S_IWOTH) == 0
}

func readLinkAt(dirfd int, name string) (string, error) {
	buf := make([]byte, 4096)
	n, err := unix.Readlinkat(dirfd, name, buf)
	if err != nil {
		return "", err
	}
	if n == len(buf) {
		return "", fmt.Errorf("link target of %q is too long", name)
	}
	return string(buf[:n]), nil
}

// Opens every component of path as a directory, each one relative to the
// previously opened one. A symlink is followed only where nobody but root
// could have planted it, and refused everywhere else.
func walkDirs(path string, depth int) (int, error) {
	if depth > maxTrustedLinks {
		return -1, fmt.Errorf("too many links resolving %q", path)
	}

	components, err := splitAbsPath(path)
	if err != nil {
		return -1, err
	}

	fd, err := unix.Open("/", dirFlags, 0)
	if err != nil {
		return -1, fmt.Errorf("could not open %q: %w", "/", err)
	}

	current := "/"
	for i, name := range components {
		child, err := unix.Openat(fd, name, dirFlags, 0)
		if err == nil {
			unix.Close(fd)
			fd, current = child, filepath.Join(current, name)
			continue
		}

		// O_NOFOLLOW on a symlink is ELOOP, or EMLINK on freebsd, or ENOTDIR
		// when O_DIRECTORY got there first. Ask what the component is rather
		// than trying to map that back.
		if !isSymlinkAt(fd, name) {
			unix.Close(fd)
			return -1, fmt.Errorf("could not open %q: %w", filepath.Join(current, name), err)
		}

		if !onlyRootCanWrite(fd) {
			unix.Close(fd)
			return -1, fmt.Errorf("refusing to resolve %q: %q is a symlink", path, filepath.Join(current, name))
		}

		target, err := readLinkAt(fd, name)
		unix.Close(fd)
		if err != nil {
			return -1, err
		}
		if !filepath.IsAbs(target) {
			target = filepath.Join(current, target)
		}
		return walkDirs(filepath.Join(append([]string{target}, components[i+1:]...)...), depth+1)
	}
	return fd, nil
}

func openParent(path string) (int, string, error) {
	components, err := splitAbsPath(path)
	if err != nil {
		return -1, "", err
	}
	if len(components) == 0 {
		return -1, "", fmt.Errorf("refusing to operate on %q: it's the root itself", path)
	}

	name := components[len(components)-1]
	fd, err := walkDirs("/"+filepath.Join(components[:len(components)-1]...), 0)
	if err != nil {
		return -1, "", err
	}
	return fd, name, nil
}

func openPath(path string, flags int) (int, error) {
	parent, name, err := openParent(path)
	if err != nil {
		return -1, err
	}
	defer unix.Close(parent)

	fd, err := unix.Openat(parent, name, flags|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		if isSymlinkAt(parent, name) {
			return -1, fmt.Errorf("refusing to resolve %q: it's a symlink", path)
		}
		return -1, fmt.Errorf("could not open %q: %w", path, err)
	}
	return fd, nil
}

func OpenExistingRDWR(file string) (*os.File, error) {
	fd, err := openPath(file, unix.O_RDWR)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(fd), file), nil
}

// isn't a link
func Rename(oldpath, newpath string) error {
	sourceParent, sourceName, err := openParent(oldpath)
	if err != nil {
		return err
	}
	defer unix.Close(sourceParent)

	if isSymlinkAt(sourceParent, sourceName) {
		return fmt.Errorf("refusing to rename %q: it's a symlink", oldpath)
	}

	targetParent, targetName, err := openParent(newpath)
	if err != nil {
		return err
	}
	defer unix.Close(targetParent)

	if err := unix.Renameat(sourceParent, sourceName, targetParent, targetName); err != nil {
		return fmt.Errorf("could not rename %q to %q: %w", oldpath, newpath, err)
	}
	return nil
}

