package graceful

import "sync"

type GracefulTerminationFunc func(bool)

var (
	// Mutex for access to other vars
	m sync.Mutex

	// True if a graceful termination has been requested
	terminationRequested bool

	// The finishTasks value passed to Terminate(), used for late callback registration
	terminationFinishTasks bool

	// callbacks for graceful termination, keyed by unique ID (e.g., task ID)
	callbacks = make(map[string]GracefulTerminationFunc)
)

// Return true if graceful termination has been requested
func TerminationRequested() bool {
	m.Lock()
	defer m.Unlock()

	return terminationRequested
}

// OnTerminationRequest sets up to call the given function (in a goroutine) when
// a termination request is received. The id parameter should be unique (e.g., task ID).
// Returns a function which, when called, will remove the callback.
// Multiple callbacks can be registered with different IDs.
func OnTerminationRequest(id string, f GracefulTerminationFunc) func() {
	m.Lock()
	defer m.Unlock()

	callbacks[id] = f

	// If termination was already requested, call the callback immediately
	// with the same finishTasks value that was originally passed to Terminate()
	if terminationRequested {
		go f(terminationFinishTasks)
	}

	return func() {
		m.Lock()
		defer m.Unlock()
		delete(callbacks, id)
	}
}

// A graceful termination has been requested. Set a flag so that no further
// tasks are claimed, and call all registered callbacks.
// If finishTasks is true, tasks should be allowed to complete.
// If finishTasks is false, tasks should be aborted immediately.
func Terminate(finishTasks bool) {
	m.Lock()
	defer m.Unlock()

	if terminationRequested {
		return
	}
	terminationRequested = true
	terminationFinishTasks = finishTasks

	// Call all registered callbacks
	for _, cb := range callbacks {
		go cb(finishTasks)
	}
}

// Reset the package to its initial state (useful in tests)
func Reset() {
	m.Lock()
	defer m.Unlock()

	terminationRequested = false
	terminationFinishTasks = false
	callbacks = make(map[string]GracefulTerminationFunc)
}

// CallbackCount returns the number of registered callbacks (useful for testing)
func CallbackCount() int {
	m.Lock()
	defer m.Unlock()
	return len(callbacks)
}
