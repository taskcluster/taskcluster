package main

import (
	"fmt"
	"math"
	"net/http"
	"testing"
)

var tests = []struct {
	name  string
	input string
	rng   Range
	err   error
}{
	{
		"invalid range type",
		"wootbar=0-10",
		Range{0, Inf},
		fmt.Errorf("Other then byte prefix given"),
	},

	{
		"Too many ranges",
		"bytes=0-10,11-20",
		Range{0, Inf},
		fmt.Errorf("Cannot handle multiple range segments..."),
	},

	{
		"Valid range with start, end",
		"bytes=0-10",
		Range{0, 10},
		nil,
	},

	{
		"Valid range only start",
		"bytes=10-",
		Range{10, Inf},
		nil,
	},

	{
		"Valid range only end",
		"bytes=-10",
		Range{0, 10},
		nil,
	},
}

func TestRangeNoHeader(t *testing.T) {
	headers := http.Header{}
	rng, err := ParseRange(headers)

	if err != nil {
		t.Fatal("Should not have an error")
	}

	if rng.start != 0 || rng.stop != int64(math.Inf(0)) {
		t.Fatal("Invalid empty range")
	}
}

func TestRange(t *testing.T) {

	for _, test := range tests {
		headers := http.Header{}
		headers.Add("Range", test.input)

		result, err := ParseRange(headers)

		if test.err != nil {
			if err.Error() != test.err.Error() {
				t.Errorf(test.name, "%s | Expected %v to equal %v", test.name, err, test.err)
			}
		} else if err != nil {
			t.Errorf("%s | %v", test.name, err)
		}

		if result.start != test.rng.start || result.stop != test.rng.stop {
			t.Errorf("%s | Expected %v to equal %v", test.name, result, test.rng)
		}
	}

}
