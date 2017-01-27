package fromNow

import (
	"testing"

	assert "github.com/stretchr/testify/require"
)

func TestParseTimeComplete(t *testing.T) {
	assert := assert.New(t)
	offset, err := parseTime("1 year 2 months 3 weeks 4 days 5 hours 6 minutes 7 seconds")

	assert.NoError(err, "the string should parse without error")
	assert.Equal(offset.years, 1)
	assert.Equal(offset.months, 2)
	assert.Equal(offset.weeks, 3)
	assert.Equal(offset.days, 4)
	assert.Equal(offset.hours, 5)
	assert.Equal(offset.minutes, 6)
	assert.Equal(offset.seconds, 7)
}

func TestParseTimeIncomplete(t *testing.T) {
	assert := assert.New(t)

	// Test if we omit some fields
	offset, err := parseTime("2 years 5 days 6 minutes")

	assert.NoError(err, "the string should parse without error")
	assert.Equal(offset.years, 2)
	assert.Equal(offset.months, 0)
	assert.Equal(offset.weeks, 0)
	assert.Equal(offset.days, 5)
	assert.Equal(offset.hours, 0)
	assert.Equal(offset.minutes, 6)
	assert.Equal(offset.seconds, 0)
}

func TestParseTimeInvalid(t *testing.T) {
	assert := assert.New(t)

	// Test if it's a valid time expression.
	_, err := parseTime("this should produce an error.")
	assert.Error(err, "the string should produce an error")
}

func TestAtoiHelper(t *testing.T) {
	assert := assert.New(t)

	assert.NotPanics(func() {
		atoiHelper("1")
	}, "should not panic")

	assert.Panics(func() {
		atoiHelper("!")
	}, "should panic")
}
