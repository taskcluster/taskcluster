package client

import (
	"math/rand"
	"time"
)

const (
	defaultInitialDelay        = 500 * time.Millisecond
	defaultMaxDelay            = 60 * time.Second
	defaultMaxElapsedTime      = 3 * time.Minute
	defaultMultiplier          = 1.5
	defaultRandomizationFactor = 0.5
)

// RetryConfig contains exponential backoff parameters for retrying
// connections.  In most cases, the default values are good enough.
type RetryConfig struct {
	// InitialDelay is the delay after which the first reconnect
	// attempt takes place.
	// Default = 500 * time.Millisecond
	InitialDelay time.Duration

	// MaxDelay is the maximum possible delay between two consecutive
	// reconnect attempts.
	// Default = 60 * time.Second
	MaxDelay time.Duration

	// MaxElapsedTime is the time after which reconnect will time out
	// Default = 3 * time.Minute
	MaxElapsedTime time.Duration

	// Multplier is the rate at which the delay will increase
	// Default = 1.5
	Multiplier float64

	// RandomizationFactor is the extent to which the delay values will be randomized
	// Default = 0.5
	RandomizationFactor float64
}

// NextDelay calculates the new retry delay based on the current delay.
func (r RetryConfig) nextDelay(currentDelay time.Duration) time.Duration {
	// check if current interval is max interval
	// avoid calculation
	if currentDelay == r.MaxDelay {
		return currentDelay
	}

	delta := r.RandomizationFactor * float64(currentDelay)
	minDelay := r.Multiplier*float64(currentDelay) - delta
	maxDelay := r.Multiplier*float64(currentDelay) + delta
	nextDelay := minDelay + (rand.Float64() * (maxDelay - minDelay + 1))
	Delay := time.Duration(nextDelay)
	if Delay > r.MaxDelay {
		Delay = r.MaxDelay
	}
	return Delay
}

// initializeRetryValues returns a copy of this RetryConfig with nonzero
// default values replacing nil values.
func (r RetryConfig) withDefaultValues() RetryConfig {
	conf := RetryConfig{
		InitialDelay:        r.InitialDelay,
		MaxDelay:            r.MaxDelay,
		MaxElapsedTime:      r.MaxElapsedTime,
		Multiplier:          r.Multiplier,
		RandomizationFactor: r.RandomizationFactor,
	}

	if r.InitialDelay == 0 {
		conf.InitialDelay = defaultInitialDelay
	}
	if r.MaxDelay == 0 {
		conf.MaxDelay = defaultMaxDelay
	}
	if r.MaxElapsedTime == 0 {
		conf.MaxElapsedTime = defaultMaxElapsedTime
	}

	if r.Multiplier < 1.0 {
		conf.Multiplier = defaultMultiplier
	}

	if r.RandomizationFactor == 0 {
		conf.RandomizationFactor = defaultRandomizationFactor
	}

	return conf
}
