package util

import (
	"context"
	"time"
)

// SleepUntilWallClock is like time.Sleep, but will wake at or near
// the given time even if the host hibernates before wakeAt.  The
// time.Sleep function uses a timer that stops ticking during host
// hibernation.
//
// Returns true if the sleep ran to wakeAt, or false if the context is
// cancelled before then.
//
// In the interest of saving power, this function sleeps for 1 minute at a
// time, checking the wall clock after each minute.  If the host returns from
// hiberanation less than 1 minute before wakeAt, it is possible that this
// function will sleep up to 1 minute past wakeAt.
func SleepUntilWallClock(wakeAt time.Time, ctx context.Context) bool {
	// strip the monotonic clock value from wakeAt
	wakeAt = wakeAt.Round(0)
	// get the current time, without monotonic clock
	now := func() time.Time { return time.Now().Round(0) }

	for {
		remainingTime := wakeAt.Sub(now())
		if remainingTime < 0 {
			return true
		}
		if remainingTime > time.Minute {
			remainingTime = time.Minute
		}
		select {
		case <-time.After(remainingTime):
		case <-ctx.Done():
			return false
		}
	}
}
