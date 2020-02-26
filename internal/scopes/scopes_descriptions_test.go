package scopes

import (
	"fmt"
	"testing"
)

func assert(t *testing.T, o fmt.Stringer, s string) {
	if o.String() != s {
		t.Log("Expected object to be resolved differently as a String:")
		t.Logf("Object: %#v", o)
		t.Logf("Expected: %q", s)
		t.Fatalf("Got: %q", o.String())
	}
}

func TestDescEmptyGiven(t *testing.T) {
	assert(t, Given{}, "<no scopes>")
}

func TestDescEmptyRequired(t *testing.T) {
	assert(t, Required{}, "<no scopes>")
}

func TestDescGiven(t *testing.T) {
	assert(t, Given{"jkl", "mno", "pqr"}, "jkl and mno and pqr")
}

func TestDescRequired(t *testing.T) {
	assert(t, Required{{"abc", "def"}, {"ghi"}, {"jkl", "mno", "pqr"}}, "(abc and def), or\nghi, or\n(jkl and mno and pqr)")
}
