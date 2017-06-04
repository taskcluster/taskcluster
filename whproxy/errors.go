package whproxy

import (
	"fmt"
)

var (
	// ErrDuplicateWorker is sent when a request attempts to add a worker to the pool with an id
	// which is present in the pool
	ErrDuplicateWorker = fmt.Errorf("duplicate worker")
)
