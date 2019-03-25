package model

//go:generate go run generatemodel.go -o ../.. -m ../model-data.txt

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/jsonschema2go"
	"github.com/taskcluster/jsonschema2go/text"
	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	"github.com/xeipuuv/gojsonschema"
	"golang.org/x/tools/imports"
)

var (
	err            error
	downloadedTime time.Time
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

func (apiDef *APIDefinition) loadJSON(reader io.Reader, rootURL string) bool {
	b := new(bytes.Buffer)
	_, err := b.ReadFrom(reader)
	exitOnFail(err)
	data := b.Bytes()
	f := new(interface{})
	err = json.Unmarshal(data, f)
	exitOnFail(err)
	schema := (*f).(map[string]interface{})["$schema"].(string)
	apiDef.SchemaURL = schema
	var m APIModel
	switch schema {
	case tcurls.APIReferenceSchema(rootURL, "v0") + "#":
		m = new(API)
	case tcurls.ExchangesReferenceSchema(rootURL, "v0") + "#":
		m = new(Exchange)
	default:
		log.Printf("WARNING: Do not know how to handle API with schema %q", schema)
		return false
	}
	err = json.Unmarshal(data, m)
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
func LoadAPIs(rootURL string) APIDefinitions {
	apiManifestURL := tcurls.APIManifest(rootURL)
	fmt.Printf("Downloading manifest from url: '%v'...\n", apiManifestURL)
	resp, err := http.Get(apiManifestURL)
	if err != nil {
		fmt.Printf("Could not download api manifest from url: '%v'!\n", apiManifestURL)
	}
	exitOnFail(err)
	apiManifestDecoder := json.NewDecoder(resp.Body)
	apiMan := TaskclusterServiceManifest{}
	err = apiManifestDecoder.Decode(&apiMan)
	exitOnFail(err)
	apiDefs := []*APIDefinition{}
	for i := range apiMan.References {
		var resp *http.Response
		resp, err = http.Get(apiMan.References[i])
		exitOnFail(err)
		defer resp.Body.Close()
		apiDef := &APIDefinition{
			URL: apiMan.References[i],
		}

		///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		// SKIP worker-manager for now, as we currently can't handle
		// https://github.com/taskcluster/taskcluster/blob/6282ebbcf0ddd00d5b3f7ac4b718247d615739f3/services/worker-manager/schemas/v1/worker-configuration.yml#L13-L15
		// despite it being valid jsonschema: https://json-schema.org/latest/json-schema-validation.html#rfc.section.6.1.1
		if apiDef.URL == tcurls.APIReference(rootURL, "worker-manager", "v1") {
			continue
		}
		///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

		if apiDef.loadJSON(resp.Body, rootURL) {
			apiDefs = append(apiDefs, apiDef)
			// check that the json schema is valid!
			validateJSON(apiDef.SchemaURL, apiDef.URL)
		}
	}
	return APIDefinitions(apiDefs)
}

func validateJSON(schemaURL, docURL string) {
	schemaLoader := gojsonschema.NewReferenceLoader(schemaURL)
	docLoader := gojsonschema.NewReferenceLoader(docURL)
	result, err := gojsonschema.Validate(schemaLoader, docLoader)
	exitOnFail(err)
	if result.Valid() {
		fmt.Printf("Document '%v' is valid against '%v'.\n", docURL, schemaURL)
	} else {
		fmt.Printf("Document '%v' is INVALID against '%v'.\n", docURL, schemaURL)
		for _, desc := range result.Errors() {
			fmt.Println("")
			fmt.Printf("- %s\n", desc)
		}
		// os.Exit(70)
	}
}

func FormatSourceAndSave(sourceFile string, sourceCode []byte) {
	fmt.Println("Formatting source code " + sourceFile + "...")
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
	}
	exitOnFail(err)
	exitOnFail(ioutil.WriteFile(sourceFile, formattedContent, 0644))
}

type APIDefinitions []*APIDefinition

// GenerateCode takes the objects loaded into memory in LoadAPIs
// and writes them out as go code.
func (apiDefs APIDefinitions) GenerateCode(goOutputDir, modelData string, downloaded time.Time) {
	downloadedTime = downloaded
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

	content := "Generated: " + strconv.FormatInt(downloadedTime.Unix(), 10) + "\n"
	content += "The following file is an auto-generated static dump of the API models at time of code generation.\n"
	content += "It is provided here for reference purposes, but is not used by any code.\n"
	content += "\n"
	for i := range apiDefs {
		content += text.Underline(apiDefs[i].URL)
		content += apiDefs[i].Data.String() + "\n\n"
		for _, url := range apiDefs[i].schemas.SortedSanitizedURLs() {
			content += text.Underline(url)
			content += apiDefs[i].schemas.SubSchema(url).String() + "\n\n"
		}
	}
	exitOnFail(ioutil.WriteFile(modelData, []byte(content), 0644))
}
