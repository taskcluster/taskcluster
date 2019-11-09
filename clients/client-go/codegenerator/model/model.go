package model

//go:generate go run generatemodel.go -o ../..

import (
	"encoding/json"
	"fmt"
	"go/format"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/taskcluster/jsonschema2go"
	"golang.org/x/tools/imports"
)

var (
	err error
)

// SortedAPIDefs is a sorted array of APIDefinitions
type SortedAPIDefs []*APIDefinition

// needed so that SortedAPIDefs can implement sort.Interface
func (a SortedAPIDefs) Len() int           { return len(a) }
func (a SortedAPIDefs) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a SortedAPIDefs) Less(i, j int) bool { return a[i].URL < a[j].URL }

// APIModel represents an abstract structured model of an API
// Currently there are two implementations - HTTP APIs and
// AMQP APIs.
type APIModel interface {
	String() string
	Name() string
	postPopulate(apiDef *APIDefinition)
	generateAPICode(name string) string
	setAPIDefinition(apiDef *APIDefinition)
}

// APIDefinition represents the definition of an API (currently a REST API or
// an AMQP API), comprising of the URL to the defintion of the API in json
// format, together with a URL to a json schema to validate the definition
type APIDefinition struct {
	URL            string `json:"url"`
	DocRoot        string `json:"docroot"`
	Data           APIModel
	schemaURLs     []string
	schemas        *jsonschema2go.SchemaSet
	members        jsonschema2go.StringSet
	PackageName    string
	ExampleVarName string
	PackagePath    string
	SchemaURL      string
}

func exitOnFail(err error) {
	if err != nil {
		fmt.Printf("%v\n%T\n", err, err)
		panic(err)
	}
}

func (apiDef *APIDefinition) generateAPICode() string {
	return apiDef.Data.generateAPICode(apiDef.Data.Name())
}

func (apiDef *APIDefinition) loadJSON(refRaw json.RawMessage) bool {
	f := new(interface{})
	err = json.Unmarshal(refRaw, f)
	exitOnFail(err)
	schemaURL := (*f).(map[string]interface{})["$schema"].(string)
	apiDef.SchemaURL = schemaURL

	schemaRaw := ReferencesServerGet(schemaURL[:len(schemaURL)-1])
	if schemaRaw == nil {
		panic(fmt.Sprintf("No schema %s", schemaRaw))
	}
	var schema interface{}
	err = json.Unmarshal(*schemaRaw, &schema)
	exitOnFail(err)
	var x interface{}

	x = schema
	x = x.(map[string]interface{})["metadata"]
	x = x.(map[string]interface{})["name"]
	schemaName := x.(string)

	x = schema
	x = x.(map[string]interface{})["metadata"]
	x = x.(map[string]interface{})["version"]
	schemaVersion := int(x.(float64))

	var m APIModel
	switch fmt.Sprintf("%s/v%d", schemaName, schemaVersion) {
	case "api/v0":
		m = new(API)
	case "exchanges/v0":
		m = new(Exchange)
	case "logs/v0":
		// nothing to do for logs..
		return false
	default:
		log.Printf("WARNING: Do not know how to handle API reference %s version %d", schemaName, schemaVersion)
		return false
	}
	err = json.Unmarshal(refRaw, m)
	exitOnFail(err)
	m.setAPIDefinition(apiDef)
	m.postPopulate(apiDef)
	apiDef.Data = m
	return true
}

// LoadAPIs takes care of reading all json files and performing elementary
// processing of the data, such as assigning unique type names to entities
// which will be translated to go types.
//
// Data is unmarshaled into objects (or instances of go types) and then
// postPopulate is called on the objects. This in turn triggers further reading
// of json files and unmarshalling where schemas refer to other schemas.
//
// When LoadAPIs returns, all json schemas and sub schemas should have been
// read and unmarhsalled into go objects.
func LoadAPIs() APIDefinitions {
	manifestRaw := ReferencesServerGet("references/manifest.json")
	if manifestRaw == nil {
		panic("no manifest.json")
	}
	apiMan := TaskclusterServiceManifest{}
	err = json.Unmarshal(*manifestRaw, &apiMan)
	exitOnFail(err)
	apiDefs := []*APIDefinition{}
	for i := range apiMan.References {
		refRaw := ReferencesServerGet(apiMan.References[i])
		if refRaw == nil {
			panic(fmt.Sprintf("could not find %s", apiMan.References[i]))
		}

		apiDef := &APIDefinition{
			URL: apiMan.References[i],
		}

		if apiDef.loadJSON(*refRaw) {
			apiDefs = append(apiDefs, apiDef)
		}
	}
	return APIDefinitions(apiDefs)
}

func FormatSourceAndSave(sourceFile string, sourceCode []byte) {
	fmt.Println("Formatting source code " + sourceFile + "...")
	// first run goimports to clean up unused imports
	formattedContent, err := imports.Process(sourceFile, sourceCode, nil)
	exitOnFail(err)

	// imports inscrutably uses the old tc-client path, so fix that up.  Note
	// that this must be the full path to allow `yarn release` to update it
	// correctly.
	formattedContent = regexp.MustCompile(`github.com/taskcluster/taskcluster-client-go`).ReplaceAll(formattedContent, []byte(`github.com/taskcluster/taskcluster/clients/client-go/v22`))

	// remove links based on the schema server
	formattedContent = regexp.MustCompile(`(?:[ \t]*//\n)?[ \t]*// See http://127.0.0.1:.*\n`).ReplaceAll(formattedContent, []byte(""))

	// only perform general format, if that worked...
	formattedContent, err = format.Source(formattedContent)
	exitOnFail(err)

	exitOnFail(ioutil.WriteFile(sourceFile, formattedContent, 0644))
}

type APIDefinitions []*APIDefinition

// GenerateCode takes the objects loaded into memory in LoadAPIs
// and writes them out as go code.
func (apiDefs APIDefinitions) GenerateCode(goOutputDir string) {
	for i := range apiDefs {
		apiDefs[i].PackageName = "tc" + strings.ToLower(apiDefs[i].Data.Name())
		// Used throughout docs, and also methods that use the class, we need a
		// variable name to be used when referencing the go type. It should not
		// clash with either the package name or the go type of the principle
		// member of the package (e.g. awsprovisioner.AwsProvisioner). We'll
		// lowercase the name (e.g. awsProvisioner) and if that clashes with
		// either package or principle member, we'll just use my<Name>. This
		// results in e.g. `var myQueue queue.Queue`, but `var awsProvisioner
		// awsprovisioner.AwsProvisioner`.
		apiDefs[i].ExampleVarName = strings.ToLower(string(apiDefs[i].Data.Name()[0])) + apiDefs[i].Data.Name()[1:]
		if apiDefs[i].ExampleVarName == apiDefs[i].Data.Name() || apiDefs[i].ExampleVarName == apiDefs[i].PackageName {
			apiDefs[i].ExampleVarName = "my" + apiDefs[i].Data.Name()
		}
		apiDefs[i].PackagePath = filepath.Join(goOutputDir, apiDefs[i].PackageName)
		err = os.MkdirAll(apiDefs[i].PackagePath, 0755)
		exitOnFail(err)

		fmt.Printf("Generating go types for %s\n", apiDefs[i].PackageName)
		job := &jsonschema2go.Job{
			Package:              apiDefs[i].PackageName,
			URLs:                 apiDefs[i].schemaURLs,
			ExportTypes:          true,
			TypeNameBlacklist:    apiDefs[i].members,
			DisableNestedStructs: true,
		}
		result, err := job.Execute()
		exitOnFail(err)

		apiDefs[i].schemas = result.SchemaSet
		typesSourceFile := filepath.Join(apiDefs[i].PackagePath, "types.go")
		FormatSourceAndSave(typesSourceFile, result.SourceCode)

		fmt.Printf("Generating functions and methods for %s\n", job.Package)
		content := `
// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the /codegenerator/model subdirectory of this project,
// making sure that ` + "`${GOPATH}/bin` is in your `PATH`" + `:
//
// go install && go generate
//
// This package was generated from the schema defined at
// ` + apiDefs[i].URL + `

`
		content += apiDefs[i].generateAPICode()
		sourceFile := filepath.Join(apiDefs[i].PackagePath, apiDefs[i].PackageName+".go")
		FormatSourceAndSave(sourceFile, []byte(content))
	}
}
