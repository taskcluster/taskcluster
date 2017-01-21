package from_now

import "testing"

func TestparseTime(t *testing.T) {

  	offset, err := parseTime("1 year 2 months 3 weeks 4 days 5 hours 6 minutes 7 seconds")
	
	if offset.years != 1 {
		t.Error("Expected 1 year, got ", offset.years)
	}
	
	if offset.months != 2 {
		t.Error("Expected 2 months, got ", offset.months)
	}

	if offset.weeks != 3 {
		t.Error("Expected 3 weeks, got ", offset.weeks)
	}

	if offset.days != 4 {
		t.Error("Expected 4 days, got ", offset.days)
	}

	if offset.hours != 5 {
		t.Error("Expected 5 hours, got ", offset.hours)
	}

	if offset.minutes != 6 {
		t.Error("Expected 6 minutes, got ", offset.minutes)
	}

	if offset.seconds != 7 {
		t.Error("Expected 7 seconds, got ", offset.seconds)
	}

	// Test if it's a valid time expression.
	offset, err = parseTime("this should produce an error.")
	if err != nil {
		t.Error("Expected an error, got ", offset)
	}
}