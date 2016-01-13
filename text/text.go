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

func Underline(text string) string {
	return text + "\n" + strings.Repeat("=", len(text)) + "\n"
}

func Normalise(name string, dict map[string]bool) string {
	// Capitalise words, and remove spaces and dashes, to acheive struct names in CamelCase,
	// but starting with an upper case letter so that the structs are exported...
	normalisedName := strings.NewReplacer(" ", "", "-", "").Replace(strings.Title(name))
	// If name already exists, add an integer suffix to name. Start with "1" and increment
	// by 1 until an unused name is found. Example: if name FooBar was generated four times
	// , the first instance would be called FooBar, then the next would be FooBar1, the next
	// FooBar2 and the last would be assigned a name of FooBar3. We do this to guarantee we
	// don't use duplicate names for different logical entities.
	for k, baseName := 1, normalisedName; dict[normalisedName]; {
		normalisedName = fmt.Sprintf("%v%v", baseName, k)
		k++
	}
	dict[normalisedName] = true
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
