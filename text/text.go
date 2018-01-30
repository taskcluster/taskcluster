// Package text contains utility functions for manipulating raw text strings
package text

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/fatih/camelcase"
)

// See https://golang.org/ref/spec#Keywords
var reservedKeyWords = map[string]bool{
	"break":       true,
	"case":        true,
	"chan":        true,
	"const":       true,
	"continue":    true,
	"default":     true,
	"defer":       true,
	"else":        true,
	"fallthrough": true,
	"for":         true,
	"func":        true,
	"go":          true,
	"goto":        true,
	"if":          true,
	"import":      true,
	"interface":   true,
	"map":         true,
	"package":     true,
	"range":       true,
	"return":      true,
	"select":      true,
	"struct":      true,
	"switch":      true,
	"type":        true,
	"var":         true,
}

// taken from https://github.com/golang/lint/blob/32a87160691b3c96046c0c678fe57c5bef761456/lint.go#L702
var commonInitialisms = map[string]bool{
	"API":   true,
	"ASCII": true,
	"CPU":   true,
	"CSS":   true,
	"DNS":   true,
	"EOF":   true,
	"GUID":  true,
	"HTML":  true,
	"HTTP":  true,
	"HTTPS": true,
	"ID":    true,
	"IP":    true,
	"JSON":  true,
	"LHS":   true,
	"OS":    true,
	"QPS":   true,
	"RAM":   true,
	"RHS":   true,
	"RPC":   true,
	"SLA":   true,
	"SMTP":  true,
	"SQL":   true,
	"SSH":   true,
	"TCP":   true,
	"TLS":   true,
	"TTL":   true,
	"UDP":   true,
	"UI":    true,
	"UID":   true,
	"UUID":  true,
	"URI":   true,
	"URL":   true,
	"UTF8":  true,
	"VM":    true,
	"XML":   true,
	"XSRF":  true,
	"XSS":   true,
}

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
// string (name) into a Go identifier (variable name, function name, etc) that
// e.g. can be used in generated code, taking into account a blacklist of names
// that should not be used, plus the blacklist of the go language reserved key
// words (https://golang.org/ref/spec#Keywords), in order to guarantee that a
// new name is created which will not conflict with an existing type.
//
// Identifier syntax: https://golang.org/ref/spec#Identifiers
//
// Strategy to convert arbitrary unicode string to a valid identifier:
//
// 1) Ensure name is valid UTF-8; if not, replace it with empty string
//
// 2) Split name into arrays of allowed runes (words), by considering a run of
// disallowed unicode characters to act as a separator, where allowed runes
// include unicode letters, unicode numbers, and '_' character (disallowed
// runes are discarded)
//
// 3) Split words further into sub words, by decomposing camel case words as
// per https://github.com/fatih/camelcase#usage-and-examples
//
// 4) Designate the case of all subwords of all words to be uppercase, with the
// exception of the first subword of the first word, which should be lowercase
// if exported is false, otherwise uppercase
//
// 5) For each subword of each word, adjust as follows: if designated as
// lowercase, lowercase all characters of the subword; if designated as
// uppercase, then if recognised as a common "initialism", then uppercase all
// the characters of the subword, otherwise uppercase only the first character
// of the subword. Common "Initialisms" are defined as per:
// https://github.com/golang/lint/blob/32a87160691b3c96046c0c678fe57c5bef761456/lint.go#L702
//
// 6) Rejoin subwords to form a single word
//
// 7) Rejoin words into a single string
//
// 8) If the string starts with a number, add a leading `_`
//
// 9) If the string is the empty string or "_", set as "Identifier"
//
// 10) If the resulting identifier is in the given blacklist, or the list of
// reserved key words (https://golang.org/ref/spec#Keywords), append the lowest
// integer possible, >= 1, that results in no blacklist conflict
//
// 11) Add the new name to the given blacklist
//
// Note, the `map[string]bool` construction is simply a mechanism to implement
// set semantics; a value of `true` signifies inclusion in the set.
// Non-existence is equivalent to existence with a value of `false`; therefore
// it is recommended to only store `true` values.
func GoIdentifierFrom(name string, exported bool, blacklist map[string]bool) (identifier string) {
	if !utf8.ValidString(name) {
		name = ""
	}
	for i, word := range strings.FieldsFunc(
		name,
		func(c rune) bool {
			return !unicode.IsLetter(c) && !unicode.IsNumber(c) && c != '_'
		},
	) {
		caseAdaptedWord := ""
		for j, subWord := range camelcase.Split(word) {
			caseAdaptedWord += fixCase(subWord, i == 0 && j == 0 && !exported)
		}
		identifier += caseAdaptedWord
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
	for k, baseName := 1, identifier; blacklist[identifier] || reservedKeyWords[identifier]; {
		identifier = fmt.Sprintf("%v%v", baseName, k)
		k++
	}
	blacklist[identifier] = true
	return
}

func fixCase(word string, makeLower bool) string {
	if word == "" {
		return ""
	}
	if makeLower {
		return strings.ToLower(word)
	}
	upper := strings.ToUpper(word)
	if commonInitialisms[upper] {
		return upper
	}
	firstRune, size := utf8.DecodeRuneInString(word)
	remainingString := word[size:]
	return string(unicode.ToUpper(firstRune)) + remainingString
}

// Returns the indefinite article (in English) for a the given noun, which is
// 'an' for nouns beginning with a vowel, otherwise 'a'.
func IndefiniteArticle(noun string) string {
	if strings.ContainsRune("AEIOUaeiou", rune(noun[0])) {
		return "an"
	}
	return "a"
}
