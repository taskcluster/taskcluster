package util

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSleepUntilWallClockTime(t *testing.T) {
	until := time.Now().Add(time.Millisecond * 10)
	require.True(t, SleepUntilWallClock(until, context.Background()))
	require.GreaterOrEqual(t, time.Now().UnixMilli(), until.UnixMilli())
}

func TestSleepUntilWallClockTimeCancel(t *testing.T) {
	until := time.Now().Add(time.Second * 10)
	ctx, cx := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cx()
	require.False(t, SleepUntilWallClock(until, ctx))
	require.Less(t, time.Now().UnixMilli(), until.UnixMilli())
}
