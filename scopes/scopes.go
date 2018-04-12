// Package scopes provides utilities for manipulating and interpreting
// Taskcluster scopes.
//
// See https://docs.taskcluster.net/presentations/scopes/#/definitions for
// formal definitions.
package scopes

import (
	"strings"

	"github.com/taskcluster/taskcluster-client-go/tcauth"
)

type (
	// `Given` represents a set of scopes assigned to a client.  For example:
	//
	//  myScopes := scopes.Given{
	//  	"abc:*",
	//  	"123:4:56",
	//  	"xyz",
	//  	"AB:*",
	//  }
	//
	// In order for a given scope to satisfy a required scope, either the given
	// scope and required scope need to match as strings, or the given scope
	// needs to be a prefix of the required scope, plus the `*` character. For
	// example, the given scope `abc:*` satisfies the required scope `abc:def`.
	Given []string
	// `Required` represents (in disjunctive normal form) permutations of
	// scopes that are sufficient to authorise a client to perform a particular
	// action. For example:
	//
	//  requiredScopes := scopes.Required{
	//  	{"abc:def", "AB:CD:EF"},
	//  	{"123:4:5"},
	//  	{"abc:def", "123:4"},
	//  	{"Xxyz"},
	//  }
	//
	// represents the requirement that the following scopes are "satisfied":
	//
	//  ("abc:def" AND "AB:CD:EF") OR "123:4:5" OR ("abc:def" AND "123:4") OR "Xxyz"
	//
	// Please note that since a required scope satisfies a given scope if they
	// are equal, required scopes ending with a `*` can be used, although are
	// relatively uncommon. See the examples.
	Required [][]string
)

// Note, this is trivially implemented by *Auth in
// github.com/taskcluster/taskcluster-client-go/tcauth package, so typically
// tcauth.New(nil) will satisfy this interface.
type ScopeExpander interface {
	ExpandScopes(*tcauth.SetOfScopes) (*tcauth.SetOfScopes, error)
}

// Returns `true` if the given scopes satisfy the required scopes.
//
// This function is ported from
// https://github.com/taskcluster/taskcluster-base/blob/218225942212e24596cee211389c276b2b985ffe/utils.js#L37-L68
func (given Given) Satisfies(required Required, scopeExpander ScopeExpander) (bool, error) {
	// special case: no required scopes is always satisfied
	if len(required) == 0 {
		return true, nil
	}
	checkFunc := func(given Given, required Required) bool {
	checkRequired:
		// outer loop - any scope set can pass in order to pass scope sets
		for _, set := range required {
			// inner loop - all scopes have to pass in order to pass scope set
			for _, scope := range set {
				// just need to find one given scope to satisfy required scope
				for _, pattern := range given {
					if scope == pattern || (strings.HasSuffix(pattern, "*") && strings.HasPrefix(scope, pattern[0:len(pattern)-1])) {
						goto scopeMatch
					}
				}
				continue checkRequired
			scopeMatch:
			}
			return true
		}
		return false
	}
	// Only expand scopes if we have to. First try with non-expanded scopes,
	// and if required is already satisfied, no need to do the extra work of
	// expanding given.
	if checkFunc(given, required) {
		return true, nil
	}
	expandedGiven, err := given.Expand(scopeExpander)
	if err != nil {
		return false, err
	}
	return checkFunc(expandedGiven, required), nil
}

func (given Given) Expand(scopeExpander ScopeExpander) (expanded Given, err error) {
	for _, scope := range given {
		if strings.HasPrefix(scope, "assume:") {
			goto hasAssume
		}
	}
	expanded = make(Given, 0, len(given))
	copy(expanded, given)
	return

hasAssume:
	scopes := &tcauth.SetOfScopes{
		Scopes: given,
	}
	s, err := scopeExpander.ExpandScopes(scopes)
	if err != nil {
		return nil, err
	}
	return Given(s.Scopes), nil
}

// Returns "<scope> and <scope> and ... and <scope>" for all scopes in given.
func (given Given) String() string {
	if len(given) == 0 {
		return "<no scopes>"
	}
	return strings.Join(given, " and ")
}

// Returns a description of the required scopes in English.
func (required Required) String() string {
	text := ""
	switch len(required) {
	case 0:
		text = "<no scopes>"
	case 1:
		text = strings.Join(required[0], ", and\n")
	default:
		lines := make([]string, len(required))
		for i, j := range required {
			switch len(j) {
			case 0:
			case 1:
				lines[i] = j[0]
			default:
				lines[i] = "(" + strings.Join(j, " and ") + ")"
			}
		}
		text += strings.Join(lines, ", or\n")
	}
	return text
}
