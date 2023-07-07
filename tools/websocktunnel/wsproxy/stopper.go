package wsproxy

import "sync"

// stopper manages stopping a fleet of goroutines.  It is basically
// a protected boolean with functionality to set, check, and wait.
type stopper struct {
	cond    sync.Cond
	stopped bool
}

func newStopper() *stopper {
	return &stopper{
		cond:    sync.Cond{L: &sync.Mutex{}},
		stopped: false,
	}
}

// set this stopper.  This can be called multiple times, and only the
// first call will have any effect.
func (s *stopper) stop() {
	s.cond.L.Lock()
	s.stopped = true
	s.cond.Broadcast()
	s.cond.L.Unlock()
}

// check this stopper (without blocking)
func (s *stopper) isStopped() bool {
	s.cond.L.Lock()
	stopped := s.stopped
	s.cond.L.Unlock()
	return stopped
}

// wait for this stopper to stop
func (s *stopper) wait() {
	s.cond.L.Lock()
	defer s.cond.L.Unlock()
	for {
		if s.stopped {
			return
		}
		s.cond.Wait()
	}
}
