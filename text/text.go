// Package text contains utility functions for manipulating raw text strings
package text

import (
	"fmt"
	"strings"
	"unicode"
)

// Indent indents a block of text with an indent string. It does this by
// placing the given indent string at the front of every line, except on the
// last line, if the last line has no characters. This special treatment
// simplifies the generation of nested text structures.
func Indent(text, indent string) string {
	if text == "" {
		return text
	}
	if text[len(text)-1:] == "\n" {
		result := ""
		for _, j := range strings.Split(text[:len(text)-1], "\n") {
			result += indent + j + "\n"
		}
		return result
	}
	result := ""
	for _, j := range strings.Split(strings.TrimRight(text, "\n"), "\n") {
		result += indent + j + "\n"
	}
	return result[:len(result)-1]
}

// Underline returns the provided text together with a new line character and a
// line of "=" characters whose length is equal to the maximum line length in
// the provided text, followed by a final newline character.
func Underline(text string) string {
	var maxlen int
	for _, j := range strings.Split(text, "\n") {
		if len(j) > maxlen {
			maxlen = len(j)
		}
	}
	return text + "\n" + strings.Repeat("=", maxlen) + "\n"
}

// Returns a string of the same length, filled with "*"s.
func StarOut(text string) string {
	return strings.Repeat("*", len(text))
}

// GoIdentifierFrom provides a mechanism to mutate an arbitrary descriptive
// string (name) into an _exported_ Go identifier (variable name, function
// name, etc) that e.g. can be used in generated code, taking into account a
// blacklist of names that have already been used, in order to guarantee that a
// new name is created which will not conflict with an existing type.
//
// Identifier syntax: https://golang.org/ref/spec#Identifiers
//
// Strategy to convert arbitrary unicode string to a valid identifier:
//
// 1) Split name into arrays of allowed runes (words), discarding disallowed
// unicode points.
//
// 2) Upper case first rune in each word (see
// https://golang.org/pkg/strings/#Title).
//
// 3) Rejoin words into a single string.
//
// 4) If the string starts with a number, add a leading `_`.
//
// 5) If the string is the empty string or "_", set as "Identifier"
//
// 6) If the resulting identifier is in the blacklist, append the lowest
// integer possible, >= 1, that results in no blacklist conflict.
//
// 7) Add the new name to the given blacklist.
//
// Note, the `map[string]bool` construction is simply a mechanism to implement
// set semantics; a value of `true` signifies inclusion in the set.
// Non-existence is equivalent to existence with a value of `false`; therefore
// it is recommended to only store `true` values.
//
// TODO: need to check behaviour of non-unicode strings
func GoIdentifierFrom(name string, blacklist map[string]bool) (identifier string) {
	for _, word := range strings.FieldsFunc(
		name,
		func(c rune) bool {
			return !unicode.IsLetter(c) && !unicode.IsNumber(c) && c != '_'
		},
	) {
		identifier += strings.Title(word)
	}

	if strings.IndexFunc(
		identifier,
		func(c rune) bool {
			return unicode.IsNumber(c)
		},
	) == 0 {
		identifier = "_" + identifier
	}

	if identifier == "" || identifier == "_" {
		identifier = "Identifier"
	}

	// If name already exists, add an integer suffix to name. Start with "1" and increment
	// by 1 until an unused name is found. Example: if name FooBar was generated four times
	// , the first instance would be called FooBar, then the next would be FooBar1, the next
	// FooBar2 and the last would be assigned a name of FooBar3. We do this to guarantee we
	// don't use duplicate names for different logical entities.
	for k, baseName := 1, identifier; blacklist[identifier]; {
		identifier = fmt.Sprintf("%v%v", baseName, k)
		k++
	}
	blacklist[identifier] = true
	return
}

// Returns the indefinite article (in English) for a the given noun, which is
// 'an' for nouns beginning with a vowel, otherwise 'a'.
func IndefiniteArticle(noun string) string {
	if strings.ContainsRune("AEIOUaeiou", rune(noun[0])) {
		return "an"
	} else {
		return "a"
	}
}
