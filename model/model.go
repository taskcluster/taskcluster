package model

import (
	"encoding/json"
	"fmt"
	"github.com/petemoore/taskcluster-client-go/utils"
	"io"
	"net/http"
	"sort"
)

var (
	apis    []APIDefinition
	schemas map[string]*JsonSubSchema = make(map[string]*JsonSubSchema)
	err     error
	// for sorting schemas by schemaURL
	schemaURLs []string
)

type SortedAPIDefs []APIDefinition

// needed so that SortedAPIDefs can implement sort.Interface
func (a SortedAPIDefs) Len() int           { return len(a) }
func (a SortedAPIDefs) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a SortedAPIDefs) Less(i, j int) bool { return a[i].URL < a[j].URL }

//////////////////////////////////////////////////////////////////
//
// From: http://schemas.taskcluster.net/base/v1/api-reference.json
//
//////////////////////////////////////////////////////////////////

type API struct {
	Version     string     `json:"version"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	BaseURL     string     `json:"baseUrl"`
	Entries     []APIEntry `json:"entries"`
}

func (api *API) String() string {
	var result string = fmt.Sprintf(
		"Version     = '%v'\n"+
			"Title       = '%v'\n"+
			"Description = '%v'\n"+
			"Base URL    = '%v'\n",
		api.Version, api.Title, api.Description, api.BaseURL)
	for i, entry := range api.Entries {
		result += fmt.Sprintf("Entry %-6v= \n%v", i, entry.String())
	}
	return result
}

func (api *API) postPopulate() {
	for i := range api.Entries {
		api.Entries[i].postPopulate()
	}
}

func (api *API) getMethodDefinitions() string {
	content := ""
	for _, entry := range api.Entries {
		content += entry.getMethodDefinitions()
	}
	return content
}

type APIEntry struct {
	Type        string     `json:"type"`
	Method      string     `json:"method"`
	Route       string     `json:"route"`
	Args        []string   `json:"args"`
	Name        string     `json:"name"`
	Scopes      [][]string `json:"scopes"`
	Input       string     `json:"input"`
	Output      string     `json:"output"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
}

func (entry *APIEntry) postPopulate() {
	cacheJsonSchema(&entry.Input)
	cacheJsonSchema(&entry.Output)
}

func (entry *APIEntry) String() string {
	return fmt.Sprintf(
		"    Entry Type        = '%v'\n"+
			"    Entry Method      = '%v'\n"+
			"    Entry Route       = '%v'\n"+
			"    Entry Args        = '%v'\n"+
			"    Entry Name        = '%v'\n"+
			"    Entry Scopes      = '%v'\n"+
			"    Entry Input       = '%v'\n"+
			"    Entry Output      = '%v'\n"+
			"    Entry Title       = '%v'\n"+
			"    Entry Description = '%v'\n",
		entry.Type, entry.Method, entry.Route, entry.Args,
		entry.Name, entry.Scopes, entry.Input, entry.Output,
		entry.Title, entry.Description)
}

func (entry *APIEntry) getMethodDefinitions() string {
	content := ""
	content += fmt.Sprintf("func (auth Auth) %v(clientId string) GetClientScopesResponse {\n\treturn apiCall().(GetClientScopesResponse)}\n", entry.Name)
	return content
}

////////////////////////////////////////////////////////////////////////
//
// From: http://schemas.taskcluster.net/base/v1/exchanges-reference.json
//
////////////////////////////////////////////////////////////////////////

type Exchange struct {
	Version        string          `json:"version"`
	Title          string          `json:"title"`
	Description    string          `json:"description"`
	ExchangePrefix string          `json:"exchangePrefix"`
	Entries        []ExchangeEntry `json:"entries"`
}

func (exchange *Exchange) String() string {
	var result string = fmt.Sprintf(
		"Version         = '%v'\n"+
			"Title           = '%v'\n"+
			"Description     = '%v'\n"+
			"Exchange Prefix = '%v'\n",
		exchange.Version, exchange.Title, exchange.Description,
		exchange.ExchangePrefix)
	for i, entry := range exchange.Entries {
		result += fmt.Sprintf("Entry %-6v= \n%v", i, entry.String())
	}
	return result
}

func (exchange *Exchange) postPopulate() {
	for i := range exchange.Entries {
		exchange.Entries[i].postPopulate()
	}
}

func (exchange *Exchange) getMethodDefinitions() string {
	return ""
}

type ExchangeEntry struct {
	Type        string         `json:"type"`
	Exchange    string         `json:"exchange"`
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	RoutingKey  []RouteElement `json:"routingKey"`
	Schema      string         `json:"schema"`
}

func (entry *ExchangeEntry) postPopulate() {
	cacheJsonSchema(&entry.Schema)
}

func (entry *ExchangeEntry) String() string {
	var result string = fmt.Sprintf(
		"    Entry Type        = '%v'\n"+
			"    Entry Exchange    = '%v'\n"+
			"    Entry Name        = '%v'\n"+
			"    Entry Title       = '%v'\n"+
			"    Entry Description = '%v'\n",
		entry.Type, entry.Exchange, entry.Name, entry.Title,
		entry.Description)
	for i, element := range entry.RoutingKey {
		result += fmt.Sprintf("    Routing Key Element %-6v= \n%v", i, element.String())
	}
	result += fmt.Sprintf("    Entry Schema      = '%v'\n", entry.Schema)
	return result
}

type RouteElement struct {
	Name          string `json:"name"`
	Summary       string `json:"summary"`
	Constant      string `json:"constant"`
	MultipleWords bool   `json:"multipleWords"`
	Required      bool   `json:"required"`
}

func (re *RouteElement) String() string {
	return fmt.Sprintf(
		"        Element Name      = '%v'\n"+
			"        Element Summary   = '%v'\n"+
			"        Element Constant  = '%v'\n"+
			"        Element M Words   = '%v'\n"+
			"        Element Required  = '%v'\n",
		re.Name, re.Summary, re.Constant, re.MultipleWords, re.Required)
}

type APIModel interface {
	String() string
	postPopulate()
	getMethodDefinitions() string
}

// APIDefinition represents the definition of a REST API, comprising of the URL to the defintion
// of the API in json format, together with a URL to a json schema to validate the definition
type APIDefinition struct {
	URL       string `json:"url"`
	SchemaURL string `json:"schema"`
	Data      APIModel
}

func loadJson(reader io.Reader, schema *string) APIModel {
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
	m.postPopulate()
	return m
}

func loadJsonSchema(url string) *JsonSubSchema {
	var resp *http.Response
	resp, err = http.Get(url)
	utils.ExitOnFail(err)
	defer resp.Body.Close()
	decoder := json.NewDecoder(resp.Body)
	m := new(JsonSubSchema)
	err = decoder.Decode(m)
	utils.ExitOnFail(err)
	m.postPopulate()
	return m
}

func cacheJsonSchema(url *string) {
	// if url is not provided, there is nothing to download
	if url == nil || *url == "" {
		return
	}
	// workaround for problem where some urls don't end with a #
	if (*url)[len(*url)-1:] != "#" {
		*url += "#"
	}
	if _, ok := schemas[*url]; !ok {
		schemas[*url] = loadJsonSchema(*url)
	}
}

func LoadAPIs(reader io.Reader) ([]APIDefinition, []string, map[string]*JsonSubSchema) {
	decoder := json.NewDecoder(reader)
	err = decoder.Decode(&apis)
	utils.ExitOnFail(err)
	sort.Sort(SortedAPIDefs(apis))
	for i := range apis {
		var resp *http.Response
		resp, err = http.Get(apis[i].URL)
		utils.ExitOnFail(err)
		defer resp.Body.Close()
		apis[i].Data = loadJson(resp.Body, &apis[i].SchemaURL)
	}
	// now all data should be loaded, let's sort the schemas
	schemaURLs = make([]string, 0, len(schemas))
	for url := range schemas {
		schemaURLs = append(schemaURLs, url)
	}
	sort.Strings(schemaURLs)
	// finally, now we can generate normalised names
	// for schemas
	// keep a record of generated struct names, so that we don't reuse old names
	// map[string]bool acts like a set of strings
	structs := make(map[string]bool)
	for _, i := range schemaURLs {
		schemas[i].StructName = utils.Normalise(*schemas[i].Title, structs)
	}
	//////////////////////////////////////////////////////////////////////////////
	// these next two lines are a temporary hack while waiting for https://github.com/taskcluster/taskcluster-queue/pull/31
	x := "object"
	schemas["http://schemas.taskcluster.net/queue/v1/list-artifacts-response.json#"].Properties.Properties["artifacts"].Items.Type = &x
	//////////////////////////////////////////////////////////////////////////////
	return apis, schemaURLs, schemas
}

func GenerateCode(goOutput, modelData string) {
	content := `
// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// in the client subdirectory:
//
// go generate && go fmt

package client
`
	content += generateStructs()
	content += generateMethods()
	utils.WriteStringToFile(content, goOutput)

	content = ""
	for _, api := range apis {
		content += utils.Underline(api.URL)
		content += api.Data.String() + "\n\n"
	}
	for _, url := range schemaURLs {
		content += (utils.Underline(url))
		content += schemas[url].String() + "\n\n"
	}
	utils.WriteStringToFile(content, modelData)
}

func generateStructs() string {
	content := "type (" // intentionally no \n here since each type starts with one already
	// Loop through all json schemas that were found referenced inside the API json schemas...
	for _, i := range schemaURLs {
		content += utils.Indent(schemas[i].StructDefinition(true), "\t")
	}
	return content + ")\n"
}

func generateMethods() string {
	content := ""
	for i := range apis {
		content += apis[i].Data.getMethodDefinitions()
	}
	return content
}
