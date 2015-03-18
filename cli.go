// jsonschema2go is the command invoked by go generate in order to generate the go client library.
package main

import (
	"bufio"
	"fmt"
	docopt "github.com/docopt/docopt-go"
	"github.com/petemoore/jsonschema2go/jsonschema2go"
	"io"
	"os"
)

func stdInToStringArray() []string {
	results := make([]string, 1)
	reader := bufio.NewReader(os.Stdin)
	for {
		line, err := reader.ReadString('\n')
		if err == io.EOF {
			break
		}
		jsonschema2go.ExitOnFail(err)
		results = append(results, line)
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
will match the parent directory name of the go file you generate.

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
	jsonschema2go.ExitOnFail(err)
	file, err := jsonschema2go.URLsToFile(arguments["-o"].(string), stdInToStringArray()...)
	jsonschema2go.ExitOnFail(err)
	fmt.Println("Generated code written to '" + file + "'.")
}
