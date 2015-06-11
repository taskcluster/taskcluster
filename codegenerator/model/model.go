package model

//go:generate generatemodel -u http://references.taskcluster.net/manifest.json -f apis.json -o ../.. -m model-data.txt

import (
	"encoding/json"
	"fmt"
	"github.com/taskcluster/taskcluster-client-go/codegenerator/utils"
	"github.com/xeipuuv/gojsonschema"
	"go/format"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
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
	URL         string `json:"url"`
	SchemaURL   string `json:"schema"`
	Name        string `json:"name"`
	DocRoot     string `json:"docroot"`
	Data        APIModel
	schemaURLs  []string
	schemas     map[string]*JsonSubSchema
	PackageName string
	PackagePath string
}

func (a *APIDefinition) generateAPICode() string {
	return a.Data.generateAPICode(a.Name)
}

func (apiDef *APIDefinition) loadJson(reader io.Reader, schema *string) {
	var m APIModel
	switch *schema {
	case "http://schemas.taskcluster.net/base/v1/api-reference.json":
		m = new(API)
	case "http://schemas.taskcluster.net/base/v1/exchanges-reference.json":
		m = new(Exchange)
	}
	decoder := json.NewDecoder(reader)
	err = decoder.Decode(m)
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
		// first check that the json schema is valid!
		validateJson(apiDefs[i].SchemaURL, apiDefs[i].URL)

		apiDefs[i].schemas = make(map[string]*JsonSubSchema)
		var resp *http.Response
		resp, err = http.Get(apiDefs[i].URL)
		utils.ExitOnFail(err)
		defer resp.Body.Close()
		apiDefs[i].loadJson(resp.Body, &apiDefs[i].SchemaURL)

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
		//////////////////////////////////////////////////////////////////////////////
		// these next four lines are a temporary hack while waiting for https://github.com/taskcluster/taskcluster-queue/pull/31
		if x, ok := apiDefs[i].schemas["http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json#"]; ok {
			y := "object"
			x.Properties.Properties["artifacts"].Items.Type = &y
		}
		//////////////////////////////////////////////////////////////////////////////
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
		// os.Exit(70)
	}
}

// GenerateCode takes the objects loaded into memory in LoadAPIs
// and writes them out as go code.
func GenerateCode(goOutputDir, modelData string) {
	for i := range apiDefs {
		apiDefs[i].PackageName = strings.ToLower(apiDefs[i].Name)
		apiDefs[i].PackagePath = filepath.Join(goOutputDir, apiDefs[i].PackageName)
		err = os.MkdirAll(apiDefs[i].PackagePath, 0755)
		utils.ExitOnFail(err)
		content := `
// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt
//
// This package was generated from the schema defined at
// ` + apiDefs[i].URL + `

`
		content += apiDefs[i].generateAPICode()
		newContent, extraPackages, rawMessageTypes := generatePayloadTypes(&apiDefs[i])
		content += newContent
		content += jsonRawMessageImplementors(&apiDefs[i], rawMessageTypes)
		extraPackagesString := ""
		for j, k := range extraPackages {
			if k {
				extraPackagesString += "\t\"" + j + "\"\n"
			}
		}
		content = strings.Replace(content, "%%{imports}", extraPackagesString, -1)
		sourceFile := filepath.Join(apiDefs[i].PackagePath, apiDefs[i].PackageName+".go")
		fmt.Println("Formatting source code " + sourceFile + "...")
		formattedContent, err := format.Source([]byte(content))
		// in case of formatting failure, let's keep the unformatted version so
		// we can troubleshoot more easily...
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
			return errors.New("json.RawMessage: UnmarshalJSON on nil pointer")
		}
		*this = append((*this)[0:0], data...)
		return nil
	}`
	}
	return content
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
