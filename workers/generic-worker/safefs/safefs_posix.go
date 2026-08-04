//go:build darwin || linux || freebsd

package safefs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

const maxTrustedLinks = 8

func splitAbsPath(path string) ([]string, error) {
	separator := func(r rune) bool { return r == '/' }

	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("could not resolve %q: %w", path, err)
	}

	components := strings.FieldsFunc(abs, separator)
	if len(components) == 0 {
		return nil, fmt.Errorf("refusing to operate on %q: it isn't a path below the root", path)
	}
	return components, nil
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

// openPath opens path one component at a time, each one relative to the
// previously opened one. Traversing symlinks a task could have planted is
// refused
func openPath(path string, leafFlags, depth int) (int, error) {
	if depth > maxTrustedLinks {
		return -1, fmt.Errorf("too many links resolving %q", path)
	}

	components, err := splitAbsPath(path)
	if err != nil {
		return -1, err
	}

	const dirFlags = unix.O_RDONLY | unix.O_DIRECTORY | unix.O_NOFOLLOW | unix.O_CLOEXEC

	fd, err := unix.Open("/", dirFlags, 0)
	if err != nil {
		return -1, fmt.Errorf("could not open %q: %w", "/", err)
	}

	current := "/"
	for i, name := range components {
		leaf := i == len(components)-1
		flags := dirFlags
		if leaf {
			flags = leafFlags | unix.O_NOFOLLOW | unix.O_CLOEXEC
		}

		child, err := unix.Openat(fd, name, flags, 0)
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

		if leaf || !onlyRootCanWrite(fd) {
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
		return openPath(filepath.Join(append([]string{target}, components[i+1:]...)...), leafFlags, depth+1)
	}
	return fd, nil
}

func OpenExistingRDWR(file string) (*os.File, error) {
	fd, err := openPath(file, unix.O_RDWR, 0)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(fd), file), nil
}
