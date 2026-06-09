//go:build darwin || freebsd

package interactive

import "golang.org/x/sys/unix"

const ioctlGetTermios = unix.TIOCGETA
