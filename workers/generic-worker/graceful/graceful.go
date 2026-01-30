package graceful

import "sync"

type GracefulTerminationFunc func(bool)

var (
	// Mutex for access to other vars
	m sync.Mutex

	// True if a graceful termination has been requested
	terminationRequested bool

	// callbacks for graceful termination, keyed by unique ID (e.g., task ID)
	callbacks = make(map[string]GracefulTerminationFunc)

	// nextID is used to generate unique IDs when none is provided
	nextID int
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
	if terminationRequested {
		go f(true) // finish tasks by default when registering late
	}

	return func() {
		m.Lock()
		defer m.Unlock()
		delete(callbacks, id)
	}
}

// OnTerminationRequestLegacy provides backwards compatibility with code that
// expects only one callback. It generates a unique ID internally.
// Returns a function which, when called, will remove the callback.
func OnTerminationRequestLegacy(f GracefulTerminationFunc) func() {
	m.Lock()
	id := nextID
	nextID++
	m.Unlock()

	return OnTerminationRequest(string(rune(id)), f)
}

// A graceful termination has been requested. Set a flag so that no further
// tasks are claimed, and call all registered callbacks.
// If finishTasks is true, tasks should be allowed to complete.
// If finishTasks is false, tasks should be aborted immediately.
func Terminate(finishTasks bool) {
	m.Lock()
	defer m.Unlock()

	terminationRequested = true

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
	callbacks = make(map[string]GracefulTerminationFunc)
	nextID = 0
}

// CallbackCount returns the number of registered callbacks (useful for testing)
func CallbackCount() int {
	m.Lock()
	defer m.Unlock()
	return len(callbacks)
}
