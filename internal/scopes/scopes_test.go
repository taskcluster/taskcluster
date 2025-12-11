package scopes

import (
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v95/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v95/internal/testrooturl"
)

func authClient(t *testing.T) *tcauth.Auth {
	t.Helper()
	return tcauth.New(nil, testrooturl.Get(t))
}

func accept(t *testing.T, given Given, required Required) {
	t.Helper()
	satisfied, err := given.Satisfies(required, authClient(t))
	if err != nil {
		t.Fatalf("Hit error: %v", err)
	}
	if !satisfied {
		t.Errorf("Expected given scopes %q to satisfy required scopes %q, but did not.", given, required)
	}
}

func reject(t *testing.T, given Given, required Required) {
	t.Helper()
	satisfied, err := given.Satisfies(required, authClient(t))
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
func TestGivenSatisfieswildcard(t *testing.T) {
	given := Given{"queue:*"}
	out, _ := given.Satisfies(Required{{"queue:route:*"}}, authClient(t))
	require.True(t, out)
	out, _ = given.Satisfies(Required{{"queue:*"}}, authClient(t))
	require.True(t, out)
	out, _ = given.Satisfies(Required{{"*"}}, authClient(t))
	require.False(t, out)

	given = Given{"queue:route"}
	out, _ = given.Satisfies(Required{{"queue:*"}}, authClient(t))
	require.False(t, out)
}

// This rather complex example is commented to demonstrate the evaluation
// process.
func TestGivenSatisfiesCompound(t *testing.T) {
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
		authClient(t),
	)
	require.True(t, satisfies)
}
