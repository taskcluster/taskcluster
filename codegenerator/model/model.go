package model

//go:generate generatemodel -u http://references.taskcluster.net/manifest.json -f apis.json -o ../.. -m model-data.txt

import (
	"encoding/json"
	"fmt"
	"github.com/petemoore/taskcluster-client-go/codegenerator/utils"
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
				"Manifest from url '%v' contains key '%v' with url '%v', but this url does not exist in supplementary data file '%v', therefore exiting...",
				apiManifestUrl, i, apiMan[i], supplementaryDataFile)
			utils.ExitOnFail(err)
		}
	}
	for i := range apiDefs {
		if apiDefs[i].Name == "" {
			fmt.Printf(
				"Manifest from url '%v' does not contain url '%v' which does exist in supplementary data file '%v', therefore exiting...",
				apiManifestUrl, apiDefs[i].URL, supplementaryDataFile)
			utils.ExitOnFail(err)
		}
	}
	for i := range apiDefs {
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
		content += generatePayloadTypes(&apiDefs[i])
		utils.WriteStringToFile(content, filepath.Join(apiDefs[i].PackagePath, apiDefs[i].PackageName+".go"))
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

// This is where we generate nested and compoound types in go to represent json payloads
// which are used as inputs and outputs for the REST API endpoints, and also for Pulse
// message bodies for the Exchange APIs
func generatePayloadTypes(apiDef *APIDefinition) string {
	content := "type (" // intentionally no \n here since each type starts with one already
	// Loop through all json schemas that were found referenced inside the API json schemas...
	for _, i := range apiDef.schemaURLs {
		content += utils.Indent(apiDef.schemas[i].TypeDefinition(true), "\t")
	}
	return content + ")\n\n"
}
