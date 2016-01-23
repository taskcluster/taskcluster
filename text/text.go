// Package text contains utility functions for manipulating raw text strings
package text

import (
	"fmt"
	"strings"
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
func StarOut(test string) string {
	return strings.Repeat("*", len(test))
}

// GoTypeNameFrom provides a mechanism to mutate an arbitrary descriptive
// string (name) into an exported Go type name that can be used in generated
// code, taking into account a blacklist of names that have already been used,
// in order to guarantee that a new name is created which will not conflict
// with an existing type.  The blacklist is updated to include the newly
// generated name. Note, the map[string]bool construction is simply a mechanism
// to implement set semantics; a value of `true` signifies inclusion in the
// set. Non-existence is equivalent to existence with a value of `false`;
// therefore it is recommended to only store `true` values.
//
// The mutation is performed by capatilising all words (see
// https://golang.org/pkg/strings/#Title), removing all spaces and hyphens, and
// then optionally appending an integer if the generated name conflicts with an
// entry in the blacklist. The appended integer will be the lowest integer
// possible, >= 1, that results in no blacklist conflict.
func GoTypeNameFrom(name string, blacklist map[string]bool) string {
	// Capitalise words, and remove spaces and dashes, to acheive struct names in CamelCase,
	// but starting with an upper case letter so that the structs are exported...
	normalisedName := strings.NewReplacer(" ", "", "-", "").Replace(strings.Title(name))
	// If name already exists, add an integer suffix to name. Start with "1" and increment
	// by 1 until an unused name is found. Example: if name FooBar was generated four times
	// , the first instance would be called FooBar, then the next would be FooBar1, the next
	// FooBar2 and the last would be assigned a name of FooBar3. We do this to guarantee we
	// don't use duplicate names for different logical entities.
	for k, baseName := 1, normalisedName; blacklist[normalisedName]; {
		normalisedName = fmt.Sprintf("%v%v", baseName, k)
		k++
	}
	blacklist[normalisedName] = true
	return normalisedName
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
