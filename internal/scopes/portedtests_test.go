package scopes

import (
	"testing"
)

// These tests are the original scope tests, ported from:
// https://raw.githubusercontent.com/taskcluster/taskcluster-base/master/test/scopematch_test.js

func TestSingleExactMatch(t *testing.T) {
	accept(t, Given{"foo:bar"}, Required{{"foo:bar"}})
}

func TestEmptyRequiredScope(t *testing.T) {
	reject(t, Given{"foo:bar"}, Required{{""}})
}

func TestPrefix(t *testing.T) {
	accept(t, Given{"foo:*"}, Required{{"foo:bar"}})
}

func TestPrefixWithNoStar(t *testing.T) {
	reject(t, Given{"foo:"}, Required{{"foo:bar"}})
}

func TestStarButNotPrefix(t *testing.T) {
	reject(t, Given{"foo:bar:*"}, Required{{"bar:bing"}})
}

func TestStarButNotSuffix(t *testing.T) {
	reject(t, Given{"bar:*"}, Required{{"foo:bar:bing"}})
}

func TestDisjunction(t *testing.T) {
	accept(t, Given{"bar:*"}, Required{{"foo:x"}, {"bar:x"}})
}

func TestConjunction(t *testing.T) {
	accept(t, Given{"bar:*", "foo:x"}, Required{{"foo:x", "bar:y"}})
}

func TestEmptyGivenScope(t *testing.T) {
	reject(t, Given{""}, Required{{"foo:bar"}})
}

func TestEmptyGiven(t *testing.T) {
	reject(t, Given{}, Required{{"foo:bar"}})
}

func TestBareStar(t *testing.T) {
	accept(t, Given{"*"}, Required{{"foo:bar", "bar:bing"}})
}

func TestGivenWithNoRequired(t *testing.T) {
	accept(t, Given{"foo:bar"}, Required{{}})
}
