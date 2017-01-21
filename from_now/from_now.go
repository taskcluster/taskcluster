package from_now

import (
	"fmt"
	"github.com/taskcluster/taskcluster-cli/extpoints"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type from_now struct{}

func init() {
	extpoints.Register("from-now", from_now{})
}

func (from_now) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (from_now) Summary() string {
	return "Returns a timestamp which is DURATION ahead in the future."
}

func (from_now) Usage() string {
	usage := "Usage: taskcluster from-now DURATION"
	usage += "\n"
	return usage
}

func (from_now) Execute(context extpoints.Context) bool {
	duration := context.Arguments["DURATION"].(string)

	offset := ParseTime(duration)

	timeToAdd := time.Hour*time.Duration(offset.weeks*7*24) +
		time.Hour*time.Duration(offset.days*24) +
		time.Hour*time.Duration(offset.hours) +
		time.Minute*time.Duration(offset.minutes) +
		time.Second*time.Duration(offset.seconds)

	timein := time.Now().Add(timeToAdd)
	timein = timein.AddDate(offset.years, offset.months, 0)

	fmt.Println(timein.Format(time.RFC3339))

	return true
}

type parse_time struct {
	years   int
	months  int
	weeks   int
	days    int
	hours   int
	minutes int
	seconds int
}

/* parseTime takes an argument `str` which is a string on the form `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also the
 * short hand `1d2h3min`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 *
 * Returns a parse_time object with all of the fields filled in with the correct values.
 */
func parseTime(str string) parse_time {

	// Regexp taken from github
	reg := []string{
		"^(\\s*(-|\\+))?",
		"(\\s*(\\d+)\\s*y((ears?)|r)?)?",
		"(\\s*(\\d+)\\s*mo(nths?)?)?",
		"(\\s*(\\d+)\\s*w((eeks?)|k)?)?",
		"(\\s*(\\d+)\\s*d(ays?)?)?",
		"(\\s*(\\d+)\\s*h((ours?)|r)?)?",
		"(\\s*(\\d+)\\s*min(utes?)?)?",
		"(\\s*(\\d+)\\s*s(ec(onds?)?)?)?",
		"\\s*$",
	}

	re := regexp.MustCompile(strings.Join(reg, ""))

	fmt.Println(re.MatchString(str))

	if !re.MatchString(str) {
		panic("String: '" + str + "' isn't a time expression")
	}

	groupMatches := re.FindAllStringSubmatch(str, -1)

	offset := parse_time{}

	// Add negative support after we figure out what we are doing with docopt because it complains about the '-'
	neg := 1
	// if groupMatches[0][2] == "-" {
	// 	neg = -1
	// }

	offset.years = mustAtoi(groupMatches[0][4]) * neg
	offset.months = mustAtoi(groupMatches[0][8]) * neg
	offset.weeks = mustAtoi(groupMatches[0][11]) * neg
	offset.days = mustAtoi(groupMatches[0][15]) * neg
	offset.hours = mustAtoi(groupMatches[0][18]) * neg
	offset.minutes = mustAtoi(groupMatches[0][22]) * neg
	offset.seconds = mustAtoi(groupMatches[0][25]) * neg

	return offset
}

/* mustAtoi is a version of strconv.Atoi that throws away the error and returns the integer assuming there
*  were no errors.
*/ 
func mustAtoi(s string) int {
	if s == "" {
		return 0
	}

	i, err := strconv.Atoi(s)
	if err != nil {
		panic("string was not a valid integer")
	}
	return i
}
