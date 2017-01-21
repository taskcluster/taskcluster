package from_now

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestparseTime(t *testing.T) {
	offset, err := parseTime("1 year 2 months 3 weeks 4 days 5 hours 6 minutes 7 seconds")

	assert.Equal(t, offset.years, 1, "they should be equal")
	assert.Equal(t, offset.months, 2, "they should be equal")
	assert.Equal(t, offset.weeks, 3, "they should be equal")
	assert.Equal(t, offset.days, 4, "they should be equal")
	assert.Equal(t, offset.hours, 5, "they should be equal")
	assert.Equal(t, offset.minutes, 6, "they should be equal")
	assert.Equal(t, offset.seconds, 7, "they should be equal")

	// Test if it's a valid time expression.
	offset, err = parseTime("this should produce an error.")
	assert.NotNil(t, err, "error should not be nil")
}
