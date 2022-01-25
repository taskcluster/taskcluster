//go:build darwin || linux
// +build darwin linux

package genericworker

import (
	"fmt"
)

func newServiceRunMethod() (runMethod, error) {
	return nil, fmt.Errorf("worker.service is only supported on Windows")
}
