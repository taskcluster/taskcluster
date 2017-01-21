package from_now

import (
	"fmt"
	"github.com/taskcluster/taskcluster-cli/extpoints"
	"regexp"
	"strconv"
	"strings"
	"time"
	"os"
	"errors"
)

type from_now struct{}

func init() {
	extpoints.Register("from-now", from_now{})
}

func (from_now) ConfigOptions() map[string]extpoints.ConfigOption {
	return nil
}

func (from_now) Summary() string {
	return "Returns a timestamp which is <duration> ahead in the future."
}

func (from_now) Usage() string {
	usage := "Usage: taskcluster from-now <duration>"
	usage += "\n"
	return usage
}

func (from_now) Execute(context extpoints.Context) bool {
	duration := context.Arguments["<duration>"].(string)

	offset, err := parseTime(duration)
	
	if err != nil {
		fmt.Fprintf(os.Stderr, "String: '" + duration + "' isn't a time expression\n")
		return false
	}

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
func parseTime(str string) (parse_time, error) {

	// Regexp taken from github.com/taskcluster/taskcluster-client/blob/master/lib/parsetime.js
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

	if !re.MatchString(str) {
		return parse_time{}, errors.New("invalid input")
	}

	groupMatches := re.FindAllStringSubmatch(str, -1)

	offset := parse_time{}

	// Add negative support after we figure out what we are doing with docopt because it complains about the '-'
	// neg := 1
	// if groupMatches[0][2] == "-" {
	// 	neg = -1
	// }

	offset.years, _ = strconv.Atoi(groupMatches[0][4]) 
	offset.months, _ = strconv.Atoi(groupMatches[0][8]) 
	offset.weeks, _ = strconv.Atoi(groupMatches[0][11]) 
	offset.days, _ = strconv.Atoi(groupMatches[0][15]) 
	offset.hours, _ = strconv.Atoi(groupMatches[0][18]) 
	offset.minutes, _ = strconv.Atoi(groupMatches[0][22]) 
	offset.seconds, _ = strconv.Atoi(groupMatches[0][25]) 

	return offset, nil
}
