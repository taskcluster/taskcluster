package fromNow

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseTimeComplete(t *testing.T) {
	assert := require.New(t)
	offset, err := parseTime("1 year 2 months 3 weeks 4 days 5 hours 6 minutes 7 seconds")

	assert.NoError(err, "err should be nil")
	assert.Equal(offset.years, 1, "they should be equal")
	assert.Equal(offset.months, 2, "they should be equal")
	assert.Equal(offset.weeks, 3, "they should be equal")
	assert.Equal(offset.days, 4, "they should be equal")
	assert.Equal(offset.hours, 5, "they should be equal")
	assert.Equal(offset.minutes, 6, "they should be equal")
	assert.Equal(offset.seconds, 7, "they should be equal")
}

func TestParseTimeIncomplete(t *testing.T) {
	assert := require.New(t)

	// Test if we omit some fields
	offset, err := parseTime("2 years 5 days 6 minutes")

	assert.NoError(err, "err should be nil")
	assert.Equal(offset.years, 2, "they should be equal")
	assert.Equal(offset.months, 0, "they should be equal")
	assert.Equal(offset.weeks, 0, "they should be equal")
	assert.Equal(offset.days, 5, "they should be equal")
	assert.Equal(offset.hours, 0, "they should be equal")
	assert.Equal(offset.minutes, 6, "they should be equal")
	assert.Equal(offset.seconds, 0, "they should be equal")
}

func TestParseTimeInvalid(t *testing.T) {
	assert := require.New(t)

	// Test if it's a valid time expression.
	_, err := parseTime("this should produce an error.")
	assert.Error(err, "err should not be nil")
}

func TestAtoiHelper(t *testing.T) {
	assert := require.New(t)

	assert.NotPanics(func() {
		atoiHelper("1")
	}, "should not panic")

	assert.Panics(func() {
		atoiHelper("!")
	}, "should panic")
}
