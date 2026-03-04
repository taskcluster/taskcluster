package graceful

import "sync"

type GracefulTerminationFunc func(bool)

var (
	// Mutex for access to other vars
	m sync.Mutex

	// True if a graceful termination has been requestd
	terminationRequested bool

	// pending callback for graceful termination (there can be only one)
	callback GracefulTerminationFunc
)

// Return true if graceful termination has been requested
func TerminationRequested() bool {
	m.Lock()
	defer m.Unlock()

	return terminationRequested
}

// Set up to call the given function (in a goroutine) when a termination
// request is received.  Returns a function which, when called, will remove
// the callback.  Only one callback can be installed at a time.
func OnTerminationRequest(f GracefulTerminationFunc) func() {
	m.Lock()
	defer m.Unlock()

	if callback != nil {
		panic("Cannot have two graceful termination callbacks")
	}
	callback = f

	return func() {
		m.Lock()
		defer m.Unlock()

		callback = nil
	}
}

// A graceful termination has been requested.  Set a flag so that no further
// tasks are claimed, and interrupt any running task if `finishTasks` is true
func Terminate(finishTasks bool) {
	m.Lock()
	defer m.Unlock()

	if terminationRequested {
		return
	}
	terminationRequested = true
	if callback != nil {
		callback(finishTasks)
	}
}

// Reset the package to its initial state (useful in tests)
func Reset() {
	m.Lock()
	defer m.Unlock()

	terminationRequested = false
	callback = nil
}
