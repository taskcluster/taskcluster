package fromNow

import (
	"bytes"
	"regexp"
	"testing"

	"github.com/spf13/cobra"
	assert "github.com/stretchr/testify/require"
)

var (
	// RegexpTimestamp is the regular expression that all timestamps should conform to
	// we assume we won't need to validate beyond 2999, this is only used for test purposes
	RegexpTimestamp = regexp.MustCompile(
		// beginning of the line
		`^` +
			// year-month-day
			`20[0-9]{2}-(1[0-2]|0[0-9])-(3[0-1]|[0-2][0-9])` +
			// T then hours:minutes:seconds (0 padded)
			`T(2[0-3]|[01][0-9])(:[0-5][0-9]){2}` +
			// Z or timezone offset
			`(Z|(\+|-)(2[0-3]|[01][0-9]):[0-5][0-9])` +
			// end of the line
			`$`,
	)
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

// TestFromNowEmpty tests an empty call of the cobra command.
func TestFromNowEmpty(t *testing.T) {
	assert := assert.New(t)

	err := fromNow(nil, []string{})
	assert.Error(err, "the input is empty and should produce an error")
}

// TestFromNowInvalid tests an invalid call of the cobra command.
func TestFromNowInvalid(t *testing.T) {
	assert := assert.New(t)

	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	err := fromNow(cmd, []string{"this should produce an error"})

	assert.Error(err, "the input is invalid and should produce an error")
}

// TestFromNowValid tests a valid call of the cobra command.
func TestFromNowValid(t *testing.T) {
	assert := assert.New(t)

	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	err := fromNow(cmd, []string{"2 years 5 days 6 minutes"})

	output := buf.String()
	output = output[0 : len(output)-1]
	match := RegexpTimestamp.MatchString(output)

	assert.NoError(err, "error when given a valid input")
	assert.True(match, "the command did not return a valid timestamp")
}

// TestFromNowSplitValid tests a valid call of the cobra command.
func TestFromNowSplitValid(t *testing.T) {
	assert := assert.New(t)

	buf := &bytes.Buffer{}
	cmd := &cobra.Command{}
	cmd.SetOutput(buf)

	err := fromNow(cmd, []string{"2", "years", "5", "days", "6", "minutes"})

	output := buf.String()
	output = output[0 : len(output)-1]
	match := RegexpTimestamp.MatchString(output)

	assert.NoError(err, "error when given a valid input")
	assert.True(match, "the command did not return a valid timestamp")
}
