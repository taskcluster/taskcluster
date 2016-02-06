// jsonschema2go is the command invoked by go generate in order to generate the go client library.
package main

import (
	"bufio"
	"fmt"
	"io"
	"os"

	docopt "github.com/docopt/docopt-go"
	"github.com/taskcluster/jsonschema2go"
)

func readStringStrip(reader *bufio.Reader, delimeter byte) (string, error) {
	token, err := reader.ReadString(delimeter)
	if err != nil {
		return "", err
	}
	// strip delimeter from end of string
	if token != "" {
		token = token[:len(token)-1]
	}
	return token, nil
}

func parseStandardIn() []string {
	results := []string{}
	reader := bufio.NewReader(os.Stdin)
	for {
		url, err := readStringStrip(reader, '\n')
		if err == io.EOF {
			break
		}
		exitOnFail(err)
		results = append(results, url)
	}
	return results
}

var (
	version = "jsonschema2go 1.0"
	usage   = `
jsonschema2go
jsonschema2go generates go source code from json schema inputs. Specifically,
it creates a single .go file that contains type defintions for all objects
found in the provided json schemas, plus any schemas that they reference. It
will automatically download json schema definitions referred to in the provided
schemas, if there are cross references to external json schemas hosted on an
available url (i.e. $ref property of json schema). You pass urls via standard
in (one per line), e.g. by generating a list of schema urls and then piping to
jsonschema2go -o <some-output-file>. The package name in the generated code
will match the parent directory name of the go file you generate. The go type
names will be taken from the "normalised" json subschema Title element.

  Example:
    cat urls.txt | jsonschema2go -o ../../generatedcode.go

  Usage:
    jsonschema2go -o GO-OUTPUT-FILE
    jsonschema2go --help

  Options:
    -h --help               Display this help text.
    -o GO-OUTPUT-FILE       The file to create/replace with generated code.
`
)

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)
	exitOnFail(err)
	file, err := jsonschema2go.URLsToFile(arguments["-o"].(string), parseStandardIn()...)
	exitOnFail(err)
	// simply output the generated file name, in the case of success, for
	// super-easy parsing
	fmt.Println(file)
}

func exitOnFail(err error) {
	if err != nil {
		fmt.Printf("%v\n%T\n", err, err)
		panic(err)
	}
}
