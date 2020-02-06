package main

import (
	"fmt"
	"go/build"
	"go/format"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/tools/imports"

	"github.com/ghodss/yaml"
	"github.com/kr/text"
	"github.com/taskcluster/jsonschema2go"
	"github.com/taskcluster/taskcluster-base-go/jsontest"
)

func main() {
	configureLogging()
	input, output, buildConstraints := parseCommandLine()
	types := generateTypes(input, output, buildConstraints)
	functions := generateFunctions(input)
	code := append(types, functions...)
	formatSourceAndSave(code, output)
}

func configureLogging() {
	// Clear all logging fields, such as timestamps etc...
	log.SetFlags(0)
	log.SetPrefix("gw-codegen: ")
}

func parseCommandLine() (string, string, string) {
	if len(os.Args) < 3 || len(os.Args) > 4 {
		log.Fatal("Usage: gw-codegen INPUT-SCHEMA OUTPUT-GO-FILE [BUILD-CONSTRAINT]")
	}
	input := os.Args[1]
	output := os.Args[2]
	buildConstraints := ""
	if len(os.Args) > 3 {
		buildConstraints = os.Args[3]
	}
	return input, output, buildConstraints
}

func generateTypes(input, output, constraint string) []byte {
	// Get target directory
	currentFolder, err := os.Getwd()
	if err != nil {
		log.Fatalf("Unable to obtain current working directory: %s", err)
	}
	parentDir := filepath.Dir(filepath.Join(currentFolder, output))
	// Read existing package of target directory
	pkg, err := build.ImportDir(parentDir, build.AllowBinary)
	if err != nil {
		log.Fatalf("Failed to determine go package inside directory '%s' - is your GOPATH set correctly ('%s')? Error: %s", parentDir, os.Getenv("GOPATH"), err)
	}
	job := jsonschema2go.Job{
		Package:              pkg.Name,
		ExportTypes:          true,
		HideStructMembers:    false,
		URLs:                 []string{input},
		SkipCodeGen:          false,
		DisableNestedStructs: true,
	}
	result, err := job.Execute()
	if err != nil {
		log.Fatalf("Failed to generate source code: %v", err)
	}
	source := result.SourceCode
	if len(constraint) > 0 {
		source = append([]byte("// +build "+constraint+"\n\n"), result.SourceCode...)
	}
	return source
}

func generateFunctions(ymlFile string) []byte {
	if !strings.HasPrefix(ymlFile, "file://") {
		return []byte{}
	}
	ymlFile = ymlFile[7:]
	data, err := ioutil.ReadFile(ymlFile)
	if err != nil {
		log.Fatalf("ERROR: Problem reading from file '%v' - %s", ymlFile, err)
	}
	// json is valid YAML, so we can safely convert, even if it is already json
	rawJSON, err := yaml.YAMLToJSON(data)
	if err != nil {
		log.Fatalf("ERROR: Problem converting file '%v' to json format - %s", ymlFile, err)
	}
	rawJSON, err = jsontest.FormatJson(rawJSON)
	if err != nil {
		log.Fatalf("ERROR: Problem pretty printing json in '%v' - %s", ymlFile, err)
	}

	// the following strings.Replace function call safely escapes backticks (`) in rawJSON
	escapedJSON := "`" + strings.Replace(text.Indent(fmt.Sprintf("%v", string(rawJSON)), ""), "`", "` + \"`\" + `", -1) + "`"

	response := `
// Returns json schema for the payload part of the task definition. Please
// note we use a go string and do not load an external file, since we want this
// to be *part of the compiled executable*. If this sat in another file that
// was loaded at runtime, it would not be burned into the build, which would be
// bad for the following two reasons:
//  1) we could no longer distribute a single binary file that didn't require
//     installation/extraction
//  2) the payload schema is specific to the version of the code, therefore
//     should be versioned directly with the code and *frozen on build*.
//
// Run ` + "`generic-worker show-payload-schema`" + ` to output this schema to standard
// out.
func taskPayloadSchema() string {
    return ` + escapedJSON + `
}`
	return []byte(response)
}

func formatSourceAndSave(sourceCode []byte, sourceFile string) error {
	// first run goimports to clean up unused imports
	fixedImports, err := imports.Process(sourceFile, sourceCode, nil)
	var formattedContent []byte
	// only perform general format, if that worked...
	if err == nil {
		// now run a standard system format
		formattedContent, err = format.Source(fixedImports)
	}
	// in case of formatting failure from either of the above formatting
	// steps, let's keep the unformatted version so we can troubleshoot
	// more easily...
	if err != nil {
		// no need to handle error as we exit below anyway
		_ = ioutil.WriteFile(sourceFile, sourceCode, 0644)
		return err
	}
	return ioutil.WriteFile(sourceFile, formattedContent, 0644)
}
