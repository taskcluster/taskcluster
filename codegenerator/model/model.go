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

	apiDef *APIDefinition
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

func (api *API) postPopulate(apiDef *APIDefinition) {

	// make sure each entry defined for this API has a unique generated method name
	methods := make(map[string]bool)

	for i := range api.Entries {
		api.Entries[i].Parent = api
		api.Entries[i].MethodName = utils.Normalise(api.Entries[i].Name, methods)
		api.Entries[i].postPopulate(apiDef)
	}
}

func (api *API) generateAPICode(apiName string) string {
	comment := ""
	if api.Description != "" {
		comment = utils.Indent(api.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	comment += "//\n"
	comment += fmt.Sprintf("// See: %v\n", api.apiDef.DocRoot)
	content := comment
	content += "package " + api.apiDef.PackageName + "\n"
	content += `
import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	hawk "github.com/tent/hawk-go"
	"io"
	"net/http"
	"reflect"
)

func (auth *Auth) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *http.Response) {
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}

	var ioReader io.Reader = nil
	if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
		ioReader = bytes.NewReader(jsonPayload)
	}
	httpRequest, err := http.NewRequest(method, auth.BaseURL+route, ioReader)
	if err != nil {
		panic(err)
	}
	// only authenticate if client library user wishes to
	if auth.Authenticate {
		// not sure if we need to regenerate this with each call, will leave in here for now...
		credentials := &hawk.Credentials{
			ID:   auth.ClientId,
			Key:  auth.AccessToken,
			Hash: sha256.New,
		}
		reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0).RequestHeader()
		httpRequest.Header.Set("Authorization", reqAuth)
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpClient := &http.Client{}
	// fmt.Println("Request\n=======")
	// fullRequest, err := httputil.DumpRequestOut(httpRequest, true)
	// fmt.Println(string(fullRequest))
	response, err := httpClient.Do(httpRequest)
	// fmt.Println("Response\n========")
	// fullResponse, err := httputil.DumpResponse(response, true)
	// fmt.Println(string(fullResponse))
	if err != nil {
		panic(err)
	}
	defer response.Body.Close()
	// if result is nil, it means there is no response body json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		json := json.NewDecoder(response.Body)
		err = json.Decode(&result)
		if err != nil {
			panic(err)
		}
	}
	// fmt.Printf("ClientId: %v\nAccessToken: %v\nPayload: %v\nURL: %v\nMethod: %v\nResult: %v\n", auth.ClientId, auth.AccessToken, string(jsonPayload), auth.BaseURL+route, method, result)
	return result, response
}
`
	exampleVarName := strings.ToLower(string(apiName[0])) + apiName[1:]
	content += `
type Auth struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// By default set to production base url for API service, but can be changed to hit a
	// different service, e.g. a staging API endpoint, or a taskcluster-proxy endpoint
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	Authenticate bool
}

`
	content += "// Returns a pointer to " + apiName + ", configured to run against production.\n"
	content += "// If you wish to point at a different API endpoint url, set the BaseURL struct\n"
	content += "// member to your chosen location. You may also disable authentication (for\n"
	content += "// example if you wish to use the taskcluster-proxy) by setting Authenticate\n"
	content += "// struct member to false.\n"
	content += "//\n"
	content += "// For example:\n"
	content += "//  " + exampleVarName + " := client.New" + apiName + "(\"123\", \"456\")                 // set clientId and accessToken\n"
	content += "//  " + exampleVarName + ".Authenticate = false          " + strings.Repeat(" ", len(apiName)) + "              // disable authentication (true by default)\n"
	content += "//  " + exampleVarName + ".BaseURL = \"http://localhost:1234/api/" + apiName + "/v1\"   // alternative API endpoint (production by default)\n"
	// here we choose an example API method to call, just the first one in the list of api.Entries
	// We need to first see if it returns one or two variables...
	if api.Entries[0].Output == "" {
		content += "//  httpResponse := " + exampleVarName + "." + api.Entries[0].MethodName + "(.....)" + strings.Repeat(" ", 20-len(api.Entries[0].MethodName)+len(apiName)) + " // for example, call the " + api.Entries[0].MethodName + "(.....) API endpoint (described further down)...\n"
	} else {
		content += "// data, httpResponse := " + exampleVarName + "." + api.Entries[0].MethodName + "(.....)" + strings.Repeat(" ", 14-len(api.Entries[0].MethodName)+len(apiName)) + " // for example, call the " + api.Entries[0].MethodName + "(.....) API endpoint (described further down)...\n"
	}
	content += "func New(clientId string, accessToken string) *Auth {\n"
	content += "\treturn &Auth{\n"
	content += "\t\tClientId: clientId,\n"
	content += "\t\tAccessToken: accessToken,\n"
	content += "\t\tBaseURL: \"" + api.BaseURL + "\",\n"
	content += "\t\tAuthenticate: true}\n"
	content += "}\n"
	content += "\n"
	for _, entry := range api.Entries {
		content += entry.generateAPICode(apiName)
	}
	return content
}

func (api *API) setAPIDefinition(apiDef *APIDefinition) {
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
	Parent     *API
}

func (entry *APIEntry) postPopulate(apiDef *APIDefinition) {
	if entry.Input != "" {
		entry.Parent.apiDef.cacheJsonSchema(&entry.Input)
		entry.Parent.apiDef.schemas[entry.Input].IsInputSchema = true
	}
	if entry.Output != "" {
		entry.Parent.apiDef.cacheJsonSchema(&entry.Output)
		entry.Parent.apiDef.schemas[entry.Output].IsOutputSchema = true
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

func (entry *APIEntry) generateAPICode(apiName string) string {
	comment := ""
	if entry.Description != "" {
		comment = utils.Indent(entry.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	comment += "//\n"
	comment += fmt.Sprintf("// See %v/#%v\n", entry.Parent.apiDef.DocRoot, entry.Name)
	inputParams := ""
	if len(entry.Args) > 0 {
		inputParams += strings.Join(entry.Args, " string, ") + " string"
	}

	apiArgsPayload := "nil"
	if entry.Input != "" {
		apiArgsPayload = "payload"
		p := "payload *" + entry.Parent.apiDef.schemas[entry.Input].TypeName
		if inputParams == "" {
			inputParams = p
		} else {
			inputParams += ", " + p
		}
	}

	responseType := "*http.Response"
	if entry.Output != "" {
		responseType = "(*" + entry.Parent.apiDef.schemas[entry.Output].TypeName + ", *http.Response)"
	}

	content := comment
	content += "func (a *Auth) " + entry.MethodName + "(" + inputParams + ") " + responseType + " {\n"
	if entry.Output != "" {
		content += "\tresponseObject, httpResponse := a.apiCall(" + apiArgsPayload + ", \"" + strings.ToUpper(entry.Method) + "\", \"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + ", -1), ">", " + \"", -1) + "\", new(" + entry.Parent.apiDef.schemas[entry.Output].TypeName + "))\n"
		content += "\treturn responseObject.(*" + entry.Parent.apiDef.schemas[entry.Output].TypeName + "), httpResponse\n"
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

	apiDef *APIDefinition
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

func (exchange *Exchange) postPopulate(apiDef *APIDefinition) {
	for i := range exchange.Entries {
		exchange.Entries[i].Parent = exchange
		exchange.Entries[i].postPopulate(apiDef)
	}
}

func (exchange *Exchange) setAPIDefinition(apiDef *APIDefinition) {
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

	Parent  *Exchange
	Payload *JsonSubSchema
}

func (entry *ExchangeEntry) postPopulate(apiDef *APIDefinition) {
	entry.Payload = entry.Parent.apiDef.cacheJsonSchema(&entry.Schema)
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
		fmt.Printf("Setting PackageName in '%v' to '%v'\n", apiDefs[i].Name, strings.ToLower(apiDefs[i].Name))
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

func (exchange *Exchange) generateAPICode(exchangeName string) string {
	comment := ""
	if exchange.Description != "" {
		comment = utils.Indent(exchange.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	comment += "//\n"
	comment += fmt.Sprintf("// See: %v\n", exchange.apiDef.DocRoot)
	content := comment
	content += "package " + exchange.apiDef.PackageName + "\n"
	content += `
import (
	"reflect"
	"strings"
)`
	comment = ""
	if exchange.Description != "" {
		comment = utils.Indent(exchange.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	content += comment
	content += "type " + exchangeName + " struct {\n}\n\n"
	entryTypeNames := make(map[string]bool, len(exchange.Entries))
	for _, entry := range exchange.Entries {
		content += entry.generateAPICode(utils.Normalise(entry.Name, entryTypeNames))
	}

	content += `
func generateRoutingKey(x interface{}) string {
	val := reflect.ValueOf(x).Elem()
	p := make([]string, 0, val.NumField())
	for i := 0; i < val.NumField(); i++ {
		valueField := val.Field(i)
		typeField := val.Type().Field(i)
		tag := typeField.Tag
		if t := tag.Get("mwords"); t != "" {
			if v := valueField.Interface(); v == "" {
				p = append(p, t)
			} else {
				p = append(p, v.(string))
			}
		}
	}
	return strings.Join(p, ".")
}
`
	return content
}

func (entry *ExchangeEntry) generateAPICode(exchangeEntry string) string {
	content := ""
	if entry.Description != "" {
		content = utils.Indent(entry.Description, "// ")
	}
	if len(content) >= 1 && content[len(content)-1:] != "\n" {
		content += "\n"
	}
	content += "//\n"
	content += fmt.Sprintf("// See %v/#%v\n", entry.Parent.apiDef.DocRoot, entry.Name)
	content += "type " + exchangeEntry + " struct {\n"
	keyNames := make(map[string]bool, len(entry.RoutingKey))
	for _, rk := range entry.RoutingKey {
		mwch := "*"
		if rk.MultipleWords {
			mwch = "#"
		}
		content += "\t" + utils.Normalise(rk.Name, keyNames) + " string `mwords:\"" + mwch + "\"`\n"
	}
	content += "}\n"
	content += "func (binding " + exchangeEntry + ") RoutingKey() string {\n"
	content += "\treturn generateRoutingKey(&binding)\n"
	content += "}\n"
	content += "\n"
	content += "func (binding " + exchangeEntry + ") ExchangeName() string {\n"
	content += "\treturn \"" + entry.Parent.ExchangePrefix + entry.Exchange + "\"\n"
	content += "}\n"
	content += "\n"
	content += "func (binding " + exchangeEntry + ") NewPayloadObject() interface{} {\n"
	content += "\treturn new(" + entry.Payload.TypeName + ")\n"
	content += "}\n"
	content += "\n"
	return content
}
