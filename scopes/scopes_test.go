package scopes

import (
	"fmt"
	"testing"
)

func accept(t *testing.T, given Given, required Required) {
	if !given.Satisfies(&required) {
		t.Errorf("Expected given scopes %q to satisfy required scopes %q, but did not.", given, required)
	}
}

func reject(t *testing.T, given Given, required Required) {
	if given.Satisfies(&required) {
		t.Errorf("Expected given scopes %q *not* to satisfy required scopes %q, but it did.", given, required)
	}
}

func TestOneScopeSetMatchNeeded(t *testing.T) {
	accept(
		t,
		Given{
			"abc:*",
			"123:4:56",
			"xyz",
			"AB:*",
		},
		Required{
			{
				"123:4:5", // NOT satisfied
			}, // => NOT satisfied
			{
				"abc:def", // satisfied by "abc:*"
				"123:4",   // NOT satisfied
			}, // => NOT satisfied
			{
				"Xxyz", // NOT satisfied
			}, // => NOT satisfied
			{
				"abc:def",  // satisfied by "abc:*"
				"AB:CD:EF", // satisfied by "AB:*"
			}, // => satisfied
		}, // => satisfied
	)
}

func TestTwoRequiredFirstMissing(t *testing.T) {
	reject(
		t,
		Given{
			"b",
		},
		Required{
			{
				"a", // satisfied by "a"
				"b", // NOT satisfied
			}, // => NOT satisfied
		}, // => NOT satisfied
	)
}

func TestTwoRequiredSecondMissing(t *testing.T) {
	reject(
		t,
		Given{
			"a",
		},
		Required{
			{
				"a", // satisfied by "a"
				"b", // NOT satisfied
			}, // => NOT satisfied
		}, // => NOT satisfied
	)
}

func TestNoGivenWithRequired(t *testing.T) {
	reject(
		t,
		Given{},
		Required{
			{
				"a", // satisfied by "a"
				"b", // NOT satisfied
			}, // => NOT satisfied
		}, // => NOT satisfied
	)
}

func TestNoGivenNoRequired(t *testing.T) {
	accept(
		t,
		Given{},
		Required{
			{},
		},
	)
}

func TestStarExpansion(t *testing.T) {
	accept(
		t,
		Given{
			"123!@#ASD%*",
		},
		Required{
			{
				"123!@#ASD%ggg", // satisfied by "123!@#ASD%*"
			}, // => satisfied
		}, // => satisfied
	)
}

func TestStarExpandsRHSOnly(t *testing.T) {
	reject(
		t,
		Given{
			"23!@#ASD%*",
		},
		Required{
			{
				"123!@#ASD%ggg", // NOT satisfied
			}, // => NOT satisfied
		}, // => NOT satisfied
	)
}

func TestSingleStarMatchesEverything(t *testing.T) {
	accept(
		t,
		Given{
			"*",
		},
		Required{
			{
				"123!@#ASD%ggg", // satisfied by "*"
				"QWERTY",        // satisfied by "*"
				"12345",         // satisfied by "*"
			}, // => satisfied
			{
				"ZXCVB", // satisfied by "*"
				"!!!!",  // satisfied by "*"
				"qWeRt", // satisfied by "*"
			}, // => satisfied
		}, // => satisfied
	)
}

func TestRequiredStarDoesntMatchNonStar(t *testing.T) {
	reject(
		t,
		Given{
			":*",
		},
		Required{
			{
				"*", // NOT satisfied
			}, // NOT satisfied
		}, // => NOT satisfied
	)
}

func TestStarMatchesStar(t *testing.T) {
	accept(
		t,
		Given{
			"*",
		},
		Required{
			{
				"*", // satisfied by "*"
			},
		},
	)
}

func TestNoMatchedScopeSetDoesntMatch(t *testing.T) {
	reject(
		t,
		Given{
			"abc:*",
			"123:4:56",
			"xyz",
		},
		Required{
			{
				"abc:def",  // satisfied by "abc:*"
				"AB:CD:EF", // NOT satisfied
			}, // => NOT satisfied
			{
				"123:4:5", // NOT satisfied
			}, // => NOT satisfied
			{
				"abc:def", // satisfied by "abc:*"
				"123:4",   // NOT satisfied
			}, // => NOT satisfied
			{
				"Xxyz", // NOT satisfied
			}, // => NOT satisfied
		}, // => NOT satisfied
	)
}

func TestStarNotExpandedWhenNotAtEnd(t *testing.T) {
	reject(
		t,
		Given{
			"a*b",
		},
		Required{
			{
				"a123b", // NOT satisfied
			}, // => NOT satisfied
		}, // => NOT satisfied
	)
}

// This rather complex example is commented to demonstrate the evaluation
// process.
func ExampleGiven_Satisfies() {
	given := Given{
		"abc:*",
		"123:4:56",
		"xyz",
		"AB:*",
	}

	fmt.Println(
		given.Satisfies(
			&Required{
				{
					"abc:def",  // satisfied by "abc:*"
					"AB:CD:EF", // satisfied by "AB:*"
				}, // => satisfied since all scopes in set are satisfied
				{
					"123:4:5", // NOT satisfied
				}, // => NOT satisfied since not all scopes in set are satisfied
				{
					"abc:def", // satisfied by "abc:*"
					"123:4",   // NOT satisfied
				}, // => NOT satisfied since not all scopes in set are satisfied
				{
					"Xxyz", // NOT satisfied
				}, // => NOT satisfied since not all scopes in set are satisfied
			}, // => satisfied since at least one set above is satisfied
		),
	)
	// Output: true
}
