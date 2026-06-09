//go:build linux

package interactive

import "golang.org/x/sys/unix"

const ioctlGetTermios = unix.TCGETS
