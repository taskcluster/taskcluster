package model

//go:generate go run generatemodel.go -u http://references.taskcluster.net/manifest.json -f apis.json -o ../.. -m ../model-data.txt

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/jsonschema2go"
	"github.com/taskcluster/jsonschema2go/text"
	// Canonical source is
	// "github.com/xeipuuv/gojsonschema"
	// but we require https://github.com/xeipuuv/gojsonschema/pull/196
	// to land, so as a temporary workaround, i've forked until this lands
	"github.com/petemoore/gojsonschema"
	"golang.org/x/tools/imports"
)

var (
	apiDefs        []APIDefinition
	err            error
	downloadedTime time.Time
)

// SortedAPIDefs is a sorted array of APIDefinitions
type SortedAPIDefs []APIDefinition

// needed so that SortedAPIDefs can implement sort.Interface
func (a SortedAPIDefs) Len() int           { return len(a) }
func (a SortedAPIDefs) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a SortedAPIDefs) Less(i, j int) bool { return a[i].URL < a[j].URL }

// APIModel represents an abstract structured model of an API
// Currently there are two implementations - HTTP APIs and
// AMQP APIs.
type APIModel interface {
	String() string
	postPopulate(apiDef *APIDefinition)
	generateAPICode(name string) string
	setAPIDefinition(apiDef *APIDefinition)
}

// APIDefinition represents the definition of an API (currently a REST API or
// an AMQP API), comprising of the URL to the defintion of the API in json
// format, together with a URL to a json schema to validate the definition
type APIDefinition struct {
	URL            string `json:"url"`
	Name           string `json:"name"`
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
	return apiDef.Data.generateAPICode(apiDef.Name)
}

func (apiDef *APIDefinition) loadJSON(reader io.Reader) {
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
	case "http://schemas.taskcluster.net/base/v1/api-reference.json#":
		m = new(API)
	case "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#":
		m = new(Exchange)
	default:
		panic(fmt.Errorf("Do not know how to handle API with schema %q", schema))
	}
	err = json.Unmarshal(data, m)
	exitOnFail(err)
	m.setAPIDefinition(apiDef)
	m.postPopulate(apiDef)
	apiDef.Data = m
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
func LoadAPIs(apiManifestURL, supplementaryDataFile string) []APIDefinition {
	resp, err := http.Get(apiManifestURL)
	if err != nil {
		fmt.Printf("Could not download api manifest from url: '%v'!\n", apiManifestURL)
	}
	exitOnFail(err)
	supDataReader, err := os.Open(supplementaryDataFile)
	if err != nil {
		fmt.Printf("Could not load supplementary data json file: '%v'!\n", supplementaryDataFile)
	}
	exitOnFail(err)
	apiManifestDecoder := json.NewDecoder(resp.Body)
	apiMan := make(map[string]string)
	err = apiManifestDecoder.Decode(&apiMan)
	exitOnFail(err)
	supDataDecoder := json.NewDecoder(supDataReader)
	err = supDataDecoder.Decode(&apiDefs)
	exitOnFail(err)
	sort.Sort(SortedAPIDefs(apiDefs))

	// build up apis based on data in *both* data sources
	for i := range apiMan {
		// seach for apiMan[i] in apis
		k := sort.Search(len(apiDefs), func(j int) bool {
			return apiDefs[j].URL >= apiMan[i]
		})
		if k < len(apiDefs) && apiDefs[k].URL == apiMan[i] {
			// url is present in supplementary data
			apiDefs[k].Name = i
		} else {
			fmt.Printf(
				"\nFATAL: Manifest from url '%v' contains key '%v' with url '%v', but this url does not exist in supplementary data file '%v', therefore exiting...\n\n",
				apiManifestURL, i, apiMan[i], supplementaryDataFile)
			os.Exit(64)
		}
	}
	for i := range apiDefs {
		if apiDefs[i].Name == "" {
			fmt.Printf(
				"\nFATAL: Manifest from url '%v' does not contain url '%v' which does exist in supplementary data file '%v', therefore exiting...\n\n",
				apiManifestURL, apiDefs[i].URL, supplementaryDataFile)
			os.Exit(65)
		}
	}
	for i := range apiDefs {

		var resp *http.Response
		resp, err = http.Get(apiDefs[i].URL)
		exitOnFail(err)
		defer resp.Body.Close()
		apiDefs[i].loadJSON(resp.Body)

		// check that the json schema is valid!
		validateJSON(apiDefs[i].SchemaURL, apiDefs[i].URL)
	}
	return apiDefs
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

func formatSourceAndSave(sourceFile string, sourceCode []byte) {
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

// GenerateCode takes the objects loaded into memory in LoadAPIs
// and writes them out as go code.
func GenerateCode(goOutputDir, modelData string, downloaded time.Time) {
	downloadedTime = downloaded
	for i := range apiDefs {
		apiDefs[i].PackageName = "tc" + strings.ToLower(apiDefs[i].Name)
		// Used throughout docs, and also methods that use the class, we need a
		// variable name to be used when referencing the go type. It should not
		// clash with either the package name or the go type of the principle
		// member of the package (e.g. awsprovisioner.AwsProvisioner). We'll
		// lowercase the name (e.g. awsProvisioner) and if that clashes with
		// either package or principle member, we'll just use my<Name>. This
		// results in e.g. `var myQueue queue.Queue`, but `var awsProvisioner
		// awsprovisioner.AwsProvisioner`.
		apiDefs[i].ExampleVarName = strings.ToLower(string(apiDefs[i].Name[0])) + apiDefs[i].Name[1:]
		if apiDefs[i].ExampleVarName == apiDefs[i].Name || apiDefs[i].ExampleVarName == apiDefs[i].PackageName {
			apiDefs[i].ExampleVarName = "my" + apiDefs[i].Name
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
		formatSourceAndSave(typesSourceFile, result.SourceCode)

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
		formatSourceAndSave(sourceFile, []byte(content))
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
