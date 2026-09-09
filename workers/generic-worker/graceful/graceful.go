package graceful

import (
	"fmt"
	"sync"
)

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

	// callbackWG tracks in-flight callback goroutines launched by Terminate
	// (or by OnTerminationRequest when termination has already happened),
	// so a deregister call can wait for the matching goroutine to finish
	// before returning. Without this, Stop()→deregister could return while
	// the callback was still racing to mutate per-task state — yielding
	// use-after-resolve behavior after Stop().
	callbackWG sync.WaitGroup
)

// Return true if graceful termination has been requested
func TerminationRequested() bool {
	m.Lock()
	defer m.Unlock()

	return terminationRequested
}

// OnTerminationRequest sets up to call the given function (in a goroutine) when
// a termination request is received. The id parameter must be unique (e.g.,
// task ID); registering with an id that's already in use panics, since silently
// overwriting would lose the prior caller's callback.
// Returns a function which, when called, removes the callback and waits for
// any already-launched callback goroutine to complete before returning.
func OnTerminationRequest(id string, f GracefulTerminationFunc) func() {
	m.Lock()
	if _, exists := callbacks[id]; exists {
		m.Unlock()
		panic(fmt.Sprintf("graceful: duplicate callback registration for id %q", id))
	}
	callbacks[id] = f

	// If termination was already requested, call the callback immediately
	// with the same finishTasks value that was originally passed to Terminate()
	if terminationRequested {
		callbackWG.Go(func() {
			f(terminationFinishTasks)
		})
	}
	m.Unlock()

	return func() {
		m.Lock()
		delete(callbacks, id)
		m.Unlock()
		// Wait outside the mutex: callbacks may themselves try to take
		// `m` (e.g. via TerminationRequested), and waiting under the
		// lock would deadlock.
		callbackWG.Wait()
	}
}

// Terminate signals that a graceful termination has been requested. It sets a
// flag so that no further tasks are claimed, and fires all registered callbacks
// in separate goroutines tracked by callbackWG so deregister calls can wait
// for them to finish. Terminate itself returns before callbacks execute.
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
		callbackWG.Go(func() {
			cb(finishTasks)
		})
	}
}

// Reset the package to its initial state (useful in tests). Waits for any
// in-flight callback goroutines from a prior Terminate before clearing
// state, so a test that calls Reset can rely on no stray goroutines
// surviving into the next test.
func Reset() {
	callbackWG.Wait()

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
