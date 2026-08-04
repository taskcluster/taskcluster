//go:build darwin || linux || freebsd

package safefs

import (
	"os"
	"syscall"
)

func OpenExistingRDWR(file string) (*os.File, error) {
	return os.OpenFile(file, os.O_RDWR|syscall.O_NOFOLLOW, 0)
}
