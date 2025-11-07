// Package fromNow implements the from-now command.
package fromNow

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v93/clients/client-shell/cmds/root"

	"github.com/spf13/cobra"
)

var log = root.Logger

func init() {
	root.Command.AddCommand(&cobra.Command{
		Use:   "from-now <duration>",
		Short: "Returns a timestamp which is <duration> ahead in the future.",
		RunE:  fromNow,
	})
}

func fromNow(cmd *cobra.Command, args []string) error {
	if len(args) < 1 {
		return errors.New("from-now requires argument <duration>")
	}
	duration := strings.Join(args, " ")

	offset, err := parseTime(duration)

	if err != nil {
		return fmt.Errorf("string '%s' is not a valid time expression", duration)
	}

	// logic taken from github.com/taskcluster/taskcluster-client/blob/master/lib/utils.js
	timeToAdd := time.Hour*time.Duration(offset.weeks*7*24) +
		time.Hour*time.Duration(offset.days*24) +
		time.Hour*time.Duration(offset.hours) +
		time.Minute*time.Duration(offset.minutes) +
		time.Second*time.Duration(offset.seconds)

	timein := time.Now().Add(timeToAdd)
	timein = timein.AddDate(offset.years, offset.months, 0)

	fmt.Fprintln(cmd.OutOrStdout(), timein.Format(time.RFC3339))

	return nil
}

type timeOffset struct {
	years   int
	months  int
	weeks   int
	days    int
	hours   int
	minutes int
	seconds int
}

/*
 * parseTime takes an argument `str` which is a string of the form `1 day 2 hours 3 minutes`
 * where specification of day, hours and minutes is optional. You can also use the
 * short hand `1d2h3min`, it's fairly tolerant of different spelling forms and
 * whitespace. But only really meant to be used with constants.
 *
 * Returns a parse_time object with all of the fields filled in with the correct values.
 */
func parseTime(str string) (timeOffset, error) {
	offset := timeOffset{}

	// Regexp taken from github.com/taskcluster/taskcluster-client/blob/master/lib/parsetime.js
	re := regexp.MustCompile(
		// beginning and sign (group 2)
		`^(\s*(-|\+))?` +
			// years offset (group 4)
			`(\s*(\d+)\s*y((ears?)|r)?)?` +
			// months offset (group 8)
			`(\s*(\d+)\s*mo(nths?)?)?` +
			// weeks offset (group 11)
			`(\s*(\d+)\s*w((eeks?)|k)?)?` +
			// days offset (group 15)
			`(\s*(\d+)\s*d(ays?)?)?` +
			// hours offset (group 18)
			`(\s*(\d+)\s*h((ours?)|r)?)?` +
			// minutes offset (group 22)
			`(\s*(\d+)\s*min(utes?)?)?` +
			// seconds offset (group 25)
			`(\s*(\d+)\s*s(ec(onds?)?)?)?` +
			// the end
			`\s*$`,
	)

	if !re.MatchString(str) {
		return offset, errors.New("invalid input")
	}

	groupMatches := re.FindAllStringSubmatch(strings.TrimSpace(str), -1)

	// Add negative support after we figure out what we are doing with docopt because it complains about the '-'
	// neg := 1
	// if groupMatches[0][1] == "-" {
	// 	neg = -1
	// }

	offset.years = atoiHelper(groupMatches[0][4])
	offset.months = atoiHelper(groupMatches[0][8])
	offset.weeks = atoiHelper(groupMatches[0][11])
	offset.days = atoiHelper(groupMatches[0][15])
	offset.hours = atoiHelper(groupMatches[0][18])
	offset.minutes = atoiHelper(groupMatches[0][22])
	offset.seconds = atoiHelper(groupMatches[0][25])

	return offset, nil
}

func atoiHelper(s string) int {
	if s == "" {
		return 0
	}

	i, err := strconv.Atoi(s)

	// This should never occur because the regex only matches digits.
	if err != nil {
		log.Panic("error: given string '" + s + "' is not a valid number.")
	}

	return i
}
