// Package scopes provides utilities for manipulating and interpreting Taskcluster scopes.
package scopes

import (
	"strings"
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
	// Please note Required scopes do _not_ contain wildcard characters; they are
	// literal strings. This differs from Given scopes.
	Required [][]string
)

// Returns `true` if the given scopes satisfy the required scopes.
//
func (given *Given) Satisfies(required *Required) bool {
checkRequired:
	// outer loop - any scope set can pass in order to pass scope sets
	for _, set := range *required {
		// inner loop - all scopes have to pass in order to pass scope set
		for _, scope := range set {
			// just need to find one given scope to satisfy required scope
			for _, pattern := range *given {
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
