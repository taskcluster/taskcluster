package model

import (
	"encoding/json"
	"fmt"
	"github.com/petemoore/taskcluster-client-go/utils"
	"io"
	"net/http"
	"sort"
	"strings"
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

	apiDef APIDefinition
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

	// make sure each entry defined for this API has a unique generated method name
	methods := make(map[string]bool)

	for i := range api.Entries {
		api.Entries[i].postPopulate()
		api.Entries[i].MethodName = utils.Normalise(api.Entries[i].Name, methods)
		api.Entries[i].API = api
	}
}

func (api *API) getMethodDefinitions(apiName string) string {
	comment := ""
	if api.Description != "" {
		comment = utils.Indent(api.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	exampleVarName := strings.ToLower(string(apiName[0])) + apiName[1:]
	comment += "//\n"
	comment += fmt.Sprintf("// See: %v\n", api.apiDef.URL)
	content := comment
	content += "type " + apiName + " struct {\n\tAuth\n}\n\n"
	content += "// Returns a pointer to " + apiName + ", configured to run against production.\n"
	content += "// If you wish to point at a different API endpoint url, set the BaseURL struct\n"
	content += "// member to your chosen location. You may also disable authentication (for\n"
	content += "// example if you wish to use the taskcluster-proxy) by setting Authenticate\n"
	content += "// struct member to false.\n"
	content += "//\n"
	content += "// For example:\n"
	content += "//  " + exampleVarName + " := New" + apiName + "(\"123\", \"456\")                        // set clientId and accessToken\n"
	content += "//  " + exampleVarName + ".Authenticate = false          " + strings.Repeat(" ", len(apiName)) + "              // disable authentication (true by default)\n"
	content += "//  " + exampleVarName + ".BaseURL = \"http://localhost:1234/api/" + apiName + "/v1\"   // alternative API endpoint (production by default)\n"
	content += "//  " + exampleVarName + "." + api.Entries[0].MethodName + "(.....)" + strings.Repeat(" ", 36-len(api.Entries[0].MethodName)+len(apiName)) + " // for example, call the " + api.Entries[0].MethodName + "(.....) API endpoint (described further down)...\n"
	content += "func New" + apiName + "(clientId string, accessToken string) *" + apiName + " {\n"
	content += "\tr := &" + apiName + "{}\n"
	content += "\tr.ClientId = clientId\n"
	content += "\tr.AccessToken = accessToken\n"
	content += "\tr.BaseURL = \"" + api.BaseURL + "\"\n"
	content += "\tr.Authenticate = true\n"
	content += "\treturn r\n"
	content += "}\n"
	content += "\n"
	for _, entry := range api.Entries {
		content += entry.getMethodDefinitions(apiName)
	}
	return content
}

func (api *API) setAPIDefinition(apiDef APIDefinition) {
	api.apiDef = apiDef
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

	MethodName string
	API        *API
}

func (entry *APIEntry) postPopulate() {
	if entry.Input != "" {
		cacheJsonSchema(&entry.Input)
		schemas[entry.Input].IsInputSchema = true
	}
	if entry.Output != "" {
		cacheJsonSchema(&entry.Output)
		schemas[entry.Output].IsOutputSchema = true
	}
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

func (entry *APIEntry) getMethodDefinitions(apiName string) string {
	comment := ""
	if entry.Description != "" {
		comment = utils.Indent(entry.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	comment += "//\n"
	comment += fmt.Sprintf("// See %v/#%v\n", entry.API.apiDef.DocRoot, entry.Name)
	inputParams := ""
	if len(entry.Args) > 0 {
		inputParams += strings.Join(entry.Args, " string, ") + " string"
	}

	apiArgsPayload := "nil"
	if entry.Input != "" {
		apiArgsPayload = "payload"
		p := "payload *" + schemas[entry.Input].StructName
		if inputParams == "" {
			inputParams = p
		} else {
			inputParams += ", " + p
		}
	}

	responseType := "*http.Response"
	if entry.Output != "" {
		responseType = "(*" + schemas[entry.Output].StructName + ", *http.Response)"
	}

	content := comment
	content += "func (a *" + apiName + ") " + entry.MethodName + "(" + inputParams + ") " + responseType + " {\n"
	if entry.Output != "" {
		content += "\tresponseObject, httpResponse := a.apiCall(" + apiArgsPayload + ", \"" + strings.ToUpper(entry.Method) + "\", \"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + ", -1), ">", " + \"", -1) + "\", new(" + schemas[entry.Output].StructName + "))\n"
		content += "\treturn responseObject.(*" + schemas[entry.Output].StructName + "), httpResponse\n"
	} else {
		content += "\t_, httpResponse := a.apiCall(" + apiArgsPayload + ", \"" + strings.ToUpper(entry.Method) + "\", \"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + ", -1), ">", " + \"", -1) + "\", nil)\n"
		content += "\treturn httpResponse\n"
	}
	content += "}\n"
	content += "\n"
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

	apiDef APIDefinition
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

func (exchange *Exchange) getMethodDefinitions(exchangeName string) string {
	return ""
}

func (exchange *Exchange) setAPIDefinition(apiDef APIDefinition) {
	exchange.apiDef = apiDef
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
	getMethodDefinitions(name string) string
	setAPIDefinition(apiDef APIDefinition)
}

// APIDefinition represents the definition of a REST API, comprising of the URL to the defintion
// of the API in json format, together with a URL to a json schema to validate the definition
type APIDefinition struct {
	URL       string `json:"url"`
	SchemaURL string `json:"schema"`
	Name      string `json:"name"`
	DocRoot   string `json:"docroot"`
	Data      APIModel
}

func (a APIDefinition) getMethodDefinitions() string {
	return a.Data.getMethodDefinitions(a.Name)
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
	// only fetch if we haven't fetched already...
	if _, ok := schemas[*url]; !ok {
		schemas[*url] = loadJsonSchema(*url)
		schemas[*url].SourceURL = *url
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
		apis[i].Data.setAPIDefinition(apis[i])
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

import "net/http"
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
		content += utils.Indent(schemas[i].TypeDefinition(true), "\t")
	}
	return content + ")\n\n"
}

func generateMethods() string {
	content := ""
	for i := range apis {
		content += apis[i].getMethodDefinitions()
	}
	return content
}
