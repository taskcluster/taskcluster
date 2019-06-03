// jsonschema2go is the command invoked by go generate in order to generate the go client library.
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
it returns a []byte of source code that can be written to a file, for all
objects found in the provided json schemas, plus any schemas that they
reference. It will automatically download json schema definitions referred to
in the provided schemas, if there are cross references to external json schemas
hosted on an available url (i.e. $ref property of json schema). You pass urls
via standard in (one per line), e.g. by generating a list of schema urls and
then piping to jsonschema2go -o <some-package-name>.

The go type names will be "normalised" from the json subschema Title element.

  Example:
    cat urls.txt | jsonschema2go -o main

  Usage:
    jsonschema2go -o GO-PACKAGE-NAME
    jsonschema2go --help

  Options:
    -h --help               Display this help text.
    -o GO-PACKAGE-NAME      The package name to use in the generated file.
`
)

func main() {
	// Parse the docopt string and exit on any error or help message.
	arguments, err := docopt.Parse(usage, nil, true, version, false, true)
	exitOnFail(err)
	job := &jsonschema2go.Job{
		Package:              arguments["-o"].(string),
		ExportTypes:          true,
		URLs:                 parseStandardIn(),
		DisableNestedStructs: true,
	}
	result, err := job.Execute()
	if err != nil {
		log.Printf("%#v", err)
		switch j := err.(type) {
		case *json.UnmarshalTypeError:
			log.Printf("Error: %v", j.Error())
			log.Printf("Field: %v", j.Field)
		}
	}
	exitOnFail(err)
	// simply output the generated file name, in the case of success, for
	// super-easy parsing
	fmt.Println(string(result.SourceCode))
}

func exitOnFail(err error) {
	if err != nil {
		fmt.Printf("%v\n%T\n", err, err)
		panic(err)
	}
}
