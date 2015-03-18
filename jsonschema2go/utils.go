package jsonschema2go

import (
	"fmt"
	"io/ioutil"
	"strings"
)

// indents a block of text with an indent string, see http://play.golang.org/p/nV1_VLau7C
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

func ExitOnFail(err error) {
	if err != nil {
		fmt.Printf("%v\n%T\n", err, err)
		panic(err)
	}
}

func WriteStringToFile(content, file string) {
	bytes := []byte(content)
	err := ioutil.WriteFile(file, bytes, 0644)
	ExitOnFail(err)
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
