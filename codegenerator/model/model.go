package model

//go:generate generatemodel -u http://references.taskcluster.net/manifest.json -f apis.json -o ../.. -m model-data.txt

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/format"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/taskcluster/taskcluster-client-go/codegenerator/utils"
	"github.com/xeipuuv/gojsonschema"
	"golang.org/x/tools/imports"
)

var (
	apiDefs []APIDefinition
	err     error
)

type SortedAPIDefs []APIDefinition

// needed so that SortedAPIDefs can implement sort.Interface
func (a SortedAPIDefs) Len() int           { return len(a) }
func (a SortedAPIDefs) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a SortedAPIDefs) Less(i, j int) bool { return a[i].URL < a[j].URL }

type APIModel interface {
	String() string
	postPopulate(apiDef *APIDefinition)
	generateAPICode(name string) string
	setAPIDefinition(apiDef *APIDefinition)
}

// APIDefinition represents the definition of a REST API, comprising of the URL to the defintion
// of the API in json format, together with a URL to a json schema to validate the definition
type APIDefinition struct {
	URL            string `json:"url"`
	Name           string `json:"name"`
	DocRoot        string `json:"docroot"`
	Data           APIModel
	schemaURLs     []string
	schemas        map[string]*JsonSubSchema
	PackageName    string
	ExampleVarName string
	PackagePath    string
	SchemaURL      string
}

func (a *APIDefinition) generateAPICode() string {
	return a.Data.generateAPICode(a.Name)
}

func (apiDef *APIDefinition) loadJson(reader io.Reader) {
	b := new(bytes.Buffer)
	_, err := b.ReadFrom(reader)
	utils.ExitOnFail(err)
	data := b.Bytes()
	f := new(interface{})
	err = json.Unmarshal(data, f)
	utils.ExitOnFail(err)
	schema := (*f).(map[string]interface{})["$schema"].(string)
	apiDef.SchemaURL = schema
	var m APIModel
	switch schema {
	case "http://schemas.taskcluster.net/base/v1/api-reference.json#":
		m = new(API)
	case "http://schemas.taskcluster.net/base/v1/exchanges-reference.json#":
		m = new(Exchange)
	}
	err = json.Unmarshal(data, m)
	utils.ExitOnFail(err)
	m.setAPIDefinition(apiDef)
	m.postPopulate(apiDef)
	apiDef.Data = m
}

func (apiDef *APIDefinition) loadJsonSchema(url string) *JsonSubSchema {
	var resp *http.Response
	resp, err = http.Get(url)
	utils.ExitOnFail(err)
	defer resp.Body.Close()
	decoder := json.NewDecoder(resp.Body)
	m := new(JsonSubSchema)
	err = decoder.Decode(m)
	utils.ExitOnFail(err)
	m.postPopulate(apiDef)
	return m
}

func (apiDef *APIDefinition) cacheJsonSchema(url *string) *JsonSubSchema {
	// if url is not provided, there is nothing to download
	if url == nil || *url == "" {
		return nil
	}
	// workaround for problem where some urls don't end with a #
	if (*url)[len(*url)-1:] != "#" {
		*url += "#"
	}
	// only fetch if we haven't fetched already...
	if _, ok := apiDef.schemas[*url]; !ok {
		apiDef.schemas[*url] = apiDef.loadJsonSchema(*url)
		apiDef.schemas[*url].SourceURL = *url
	}
	return apiDef.schemas[*url]
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
func LoadAPIs(apiManifestUrl, supplementaryDataFile string) []APIDefinition {
	resp, err := http.Get(apiManifestUrl)
	if err != nil {
		fmt.Printf("Could not download api manifest from url: '%v'!\n", apiManifestUrl)
	}
	utils.ExitOnFail(err)
	supDataReader, err := os.Open(supplementaryDataFile)
	if err != nil {
		fmt.Printf("Could not load supplementary data json file: '%v'!\n", supplementaryDataFile)
	}
	utils.ExitOnFail(err)
	apiManifestDecoder := json.NewDecoder(resp.Body)
	apiMan := make(map[string]string)
	err = apiManifestDecoder.Decode(&apiMan)
	utils.ExitOnFail(err)
	supDataDecoder := json.NewDecoder(supDataReader)
	err = supDataDecoder.Decode(&apiDefs)
	utils.ExitOnFail(err)
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
				apiManifestUrl, i, apiMan[i], supplementaryDataFile)
			os.Exit(64)
		}
	}
	for i := range apiDefs {
		if apiDefs[i].Name == "" {
			fmt.Printf(
				"\nFATAL: Manifest from url '%v' does not contain url '%v' which does exist in supplementary data file '%v', therefore exiting...\n\n",
				apiManifestUrl, apiDefs[i].URL, supplementaryDataFile)
			os.Exit(65)
		}
	}
	for i := range apiDefs {

		apiDefs[i].schemas = make(map[string]*JsonSubSchema)
		var resp *http.Response
		resp, err = http.Get(apiDefs[i].URL)
		utils.ExitOnFail(err)
		defer resp.Body.Close()
		apiDefs[i].loadJson(resp.Body)

		// check that the json schema is valid!
		validateJson(apiDefs[i].SchemaURL, apiDefs[i].URL)

		// now all data should be loaded, let's sort the schemas
		apiDefs[i].schemaURLs = make([]string, 0, len(apiDefs[i].schemas))
		for url := range apiDefs[i].schemas {
			apiDefs[i].schemaURLs = append(apiDefs[i].schemaURLs, url)
		}
		sort.Strings(apiDefs[i].schemaURLs)
		// finally, now we can generate normalised names
		// for schemas
		// keep a record of generated type names, so that we don't reuse old names
		// map[string]bool acts like a set of strings
		TypeName := make(map[string]bool)
		for _, j := range apiDefs[i].schemaURLs {
			apiDefs[i].schemas[j].TypeName = utils.Normalise(*apiDefs[i].schemas[j].Title, TypeName)
		}
	}
	return apiDefs
}

func validateJson(schemaUrl, docUrl string) {
	schemaLoader := gojsonschema.NewReferenceLoader(schemaUrl)
	docLoader := gojsonschema.NewReferenceLoader(docUrl)
	result, err := gojsonschema.Validate(schemaLoader, docLoader)
	utils.ExitOnFail(err)
	if result.Valid() {
		fmt.Printf("Document '%v' is valid against '%v'.\n", docUrl, schemaUrl)
	} else {
		fmt.Printf("Document '%v' is INVALID against '%v'.\n", docUrl, schemaUrl)
		for _, desc := range result.Errors() {
			fmt.Println("")
			fmt.Printf("- %s\n", desc)
		}
		os.Exit(70)
	}
}

// GenerateCode takes the objects loaded into memory in LoadAPIs
// and writes them out as go code.
func GenerateCode(goOutputDir, modelData string) {
	for i := range apiDefs {
		apiDefs[i].PackageName = strings.ToLower(apiDefs[i].Name)
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
		utils.ExitOnFail(err)
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
		newContent, extraPackages, rawMessageTypes := generatePayloadTypes(&apiDefs[i])
		content += newContent
		content += jsonRawMessageImplementors(&apiDefs[i], rawMessageTypes)
		content += timeManagement(&apiDefs[i])
		extraPackagesString := ""
		for j, k := range extraPackages {
			if k {
				extraPackagesString += "\t\"" + j + "\"\n"
			}
		}
		content = strings.Replace(content, "%%{imports}", extraPackagesString, -1)
		sourceFile := filepath.Join(apiDefs[i].PackagePath, apiDefs[i].PackageName+".go")
		fmt.Println("Formatting source code " + sourceFile + "...")
		// first run goimports to clean up unused imports
		fixedImports, err := imports.Process(sourceFile, []byte(content), nil)
		// only proceed, if that worked...
		var formattedContent []byte
		if err == nil {
			// now run a standard system format
			formattedContent, err = format.Source(fixedImports)
		}
		// in case of formatting failure from either of the above formatting
		// steps, let's keep the unformatted version so we can troubleshoot
		// more easily...
		if err != nil {
			utils.WriteStringToFile(content, sourceFile)
		}
		utils.ExitOnFail(err)
		utils.WriteStringToFile(string(formattedContent), sourceFile)
	}

	content := "The following file is an auto-generated static dump of the API models at time of code generation.\n"
	content += "It is provided here for reference purposes, but is not used by any code.\n"
	content += "\n"
	for i := range apiDefs {
		content += utils.Underline(apiDefs[i].URL)
		content += apiDefs[i].Data.String() + "\n\n"
		for _, url := range apiDefs[i].schemaURLs {
			content += (utils.Underline(url))
			content += apiDefs[i].schemas[url].String() + "\n\n"
		}
	}
	utils.WriteStringToFile(content, modelData)
}

func jsonRawMessageImplementors(apiDef *APIDefinition, rawMessageTypes map[string]bool) string {
	// first sort the order of the rawMessageTypes since when we rebuild, we
	// don't want to generate functions in a different order and introduce
	// diffs against the previous version
	sortedRawMessageTypes := make([]string, len(rawMessageTypes))
	i := 0
	for goType := range rawMessageTypes {
		sortedRawMessageTypes[i] = goType
		i++
	}
	sort.Strings(sortedRawMessageTypes)
	content := ""
	for _, goType := range sortedRawMessageTypes {
		content += `

	// MarshalJSON calls json.RawMessage method of the same name. Required since
	// ` + goType + ` is of type json.RawMessage...
	func (this *` + goType + `) MarshalJSON() ([]byte, error) {
		x := json.RawMessage(*this)
		return (&x).MarshalJSON()
	}

	// UnmarshalJSON is a copy of the json.RawMessage implementation.
	func (this *` + goType + `) UnmarshalJSON(data []byte) error {
		if this == nil {
			return errors.New("` + goType + `: UnmarshalJSON on nil pointer")
		}
		*this = append((*this)[0:0], data...)
		return nil
	}`
	}
	return content
}

func timeManagement(apiDef *APIDefinition) string {

	return `
// Wraps time.Time in order that json serialisation/deserialisation can be adapted.
// Marshaling time.Time types results in RFC3339 dates with nanosecond precision
// in the user's timezone. In order that the json date representation is consistent
// between what we send in json payloads, and what taskcluster services return,
// we wrap time.Time into type ` + apiDef.PackageName + `.Time which marshals instead
// to the same format used by the TaskCluster services; UTC based, with millisecond
// precision, using 'Z' timezone, e.g. 2015-10-27T20:36:19.255Z.
type Time time.Time

// MarshalJSON implements the json.Marshaler interface.
// The time is a quoted string in RFC 3339 format, with sub-second precision added if present.
func (t Time) MarshalJSON() ([]byte, error) {
	if y := time.Time(t).Year(); y < 0 || y >= 10000 {
		// RFC 3339 is clear that years are 4 digits exactly.
		// See golang.org/issue/4556#c15 for more discussion.
		return nil, errors.New("queue.Time.MarshalJSON: year outside of range [0,9999]")
	}
	return []byte(` + "`" + `"` + "` + t.String() + `" + `"` + "`" + `), nil
}

// UnmarshalJSON implements the json.Unmarshaler interface.
// The time is expected to be a quoted string in RFC 3339 format.
func (t *Time) UnmarshalJSON(data []byte) (err error) {
	// Fractional seconds are handled implicitly by Parse.
	x := new(time.Time)
	*x, err = time.Parse(` + "`" + `"` + "`+time.RFC3339+`" + `"` + "`" + `, string(data))
	*t = Time(*x)
	return
}

// Returns the Time in canonical RFC3339 representation, e.g.
// 2015-10-27T20:36:19.255Z
func (t Time) String() string {
	return time.Time(t).UTC().Format("2006-01-02T15:04:05.000Z")
}
`
}

// This is where we generate nested and compoound types in go to represent json payloads
// which are used as inputs and outputs for the REST API endpoints, and also for Pulse
// message bodies for the Exchange APIs.
// Returns the generated code content, and a map of keys of extra packages to import, e.g.
// a generated type might use time.Time, so if not imported, this would have to be added.
// using a map of strings -> bool to simulate a set - true => include
func generatePayloadTypes(apiDef *APIDefinition) (string, map[string]bool, map[string]bool) {
	extraPackages := make(map[string]bool)
	rawMessageTypes := make(map[string]bool)
	content := "type (" // intentionally no \n here since each type starts with one already
	// Loop through all json schemas that were found referenced inside the API json schemas...
	for _, i := range apiDef.schemaURLs {
		var newContent string
		newContent, extraPackages, rawMessageTypes = apiDef.schemas[i].TypeDefinition(true, extraPackages, rawMessageTypes)
		content += utils.Indent(newContent, "\t")
	}
	return content + ")\n\n", extraPackages, rawMessageTypes
}
