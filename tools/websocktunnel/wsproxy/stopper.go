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
func (self *stopper) stop() {
	self.cond.L.Lock()
	self.stopped = true
	self.cond.Broadcast()
	self.cond.L.Unlock()
}

// check this stopper (without blocking)
func (self *stopper) is_stopped() bool {
	self.cond.L.Lock()
	stopped := self.stopped
	self.cond.L.Unlock()
	return stopped
}

// wait for this stopper to stop
func (self *stopper) wait() {
	self.cond.L.Lock()
	defer self.cond.L.Unlock()
	for {
		if self.stopped {
			return
		}
		self.cond.Wait()
	}
}
