package scopes

import (
	"fmt"
	"testing"

	"github.com/taskcluster/taskcluster-client-go/tcauth"
)

// tests only call public APIs, so no auth needed and we can use mozilla production deployment
var auth *tcauth.Auth = tcauth.New(nil, "https://taskcluster.net")

func accept(t *testing.T, given Given, required Required) {
	satisfied, err := given.Satisfies(required, auth)
	if err != nil {
		t.Fatalf("Hit error: %v", err)
	}
	if !satisfied {
		t.Errorf("Expected given scopes %q to satisfy required scopes %q, but did not.", given, required)
	}
}

func reject(t *testing.T, given Given, required Required) {
	satisfied, err := given.Satisfies(required, auth)
	if err != nil {
		t.Fatalf("Hit error: %v", err)
	}
	if satisfied {
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
				"a", // NOT satisfied
				"b", // satisfied by "b"
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

func TestNoGivenEmptyRequired(t *testing.T) {
	accept(
		t,
		Given{},
		Required{
			{},
		},
	)
}

func TestNoGivenNoRequired(t *testing.T) {
	accept(
		t,
		Given{},
		Required{},
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

// This example demonstrates the use of a required scope with a trailing `*`
// character.
func ExampleGiven_Satisfies_wildcard() {
	given := Given{"queue:*"}
	out, _ := given.Satisfies(Required{{"queue:route:*"}}, auth)
	fmt.Println(out)
	out, _ = given.Satisfies(Required{{"queue:*"}}, auth)
	fmt.Println(out)
	out, _ = given.Satisfies(Required{{"*"}}, auth)
	fmt.Println(out)

	given = Given{"queue:route"}
	out, _ = given.Satisfies(Required{{"queue:*"}}, auth)
	fmt.Println(out)
	// Output:
	// true
	// true
	// false
	// false
}

// This rather complex example is commented to demonstrate the evaluation
// process.
func ExampleGiven_Satisfies_compound() {
	given := Given{
		"abc:*",
		"123:4:56",
		"xyz",
		"AB:*",
	}

	satisfies, _ := given.Satisfies(
		Required{
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
		auth,
	)
	fmt.Println(satisfies)
	// Output: true
}

func ExampleGiven_Satisfies_expanded() {
	given := Given{
		"assume:repo:github.com/bugzilla/bugzilla:*",
	}
	satisfies, _ := given.Satisfies(
		Required{
			{
				"assume:repo:github.com/bugzilla/bugzilla:*",
				"queue:create-task:aws-provisioner-v1/b2gtest",
				"queue:create-task:aws-provisioner-v1/github-worker",
				"queue:route:gaia-taskcluster",
				"queue:route:index.garbage.*",
				"queue:route:tc-treeherder-stage.v2.bugzilla/bugzilla.*",
				"queue:route:tc-treeherder.bugzilla-master.*",
				"queue:route:tc-treeherder.bugzilla.*",
				"queue:route:tc-treeherder.v2.bugzilla/bugzilla-master.*",
				"queue:route:tc-treeherder.v2.bugzilla/bugzilla.*",
				"secrets:get:garbage/*",
				"secrets:set:garbage/*",
			},
		},
		auth,
	)
	fmt.Println(satisfies)
	// Output: true
}
