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
	// keep a record of generated struct names, so that we don't reuse old names
	// map[string]bool acts like a set of strings
	structs map[string]bool = make(map[string]bool)
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
	return apis, schemaURLs, schemas
}

func GenerateCode(goOutput, modelData string) {
	content := `
// The following code is AUTO-GENERATED. Please DO NOT edit.
// To update this generated code, run the following command:
// 
// go generate

package client
`
	content += generateStructs()
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
	content := ""
	// Loop through all json schemas that were found referenced inside the API json schemas...
	for _, i := range schemaURLs {
		// Capitalise words, and remove spaces and dashes, to acheive struct names in CamelCase,
		// but starting with an upper case letter so that the structs are exported...
		structName := strings.NewReplacer(" ", "", "-", "").Replace(strings.Title(*schemas[i].Title))
		// If structName already exists, add an integer suffix to name. Start with "1" and increment
		// by 1 until an unused structName is found. Example: if structName FooBar was generated four
		// times, the first instance would be called FooBar, then the next would be FooBar1, the next
		// FooBar2 and the last would be assigned a structName of FooBar3. We do this to guarantee
		// we don't use duplicate struct names for different logical schemas.
		for k, baseName := 1, structName; structs[structName]; {
			structName = fmt.Sprintf("%v%v", baseName, k)
			k++
		}
		structs[structName] = true
		schemas[i].StructName = structName
		content += "\n"
		content += fmt.Sprintf("type %v struct {\n", structName)
		if s := schemas[i].Properties; s != nil {
			for _, j := range s.SortedPropertyNames {
				typ := "unknown"
				if p := s.Properties[j].Type; p != nil {
					typ = *p
				}
				if typ == "array" {
					if jsonType := s.Properties[j].Items.Type; jsonType != nil {
						if *jsonType == "" {
							typ = "[]" + *s.Properties[j].Items.Title
						} else {
							typ = "[]" + *jsonType
						}
					}
				}
				// comment the struct member with the description from the json
				comment := "No comment"
				if s.Properties[j].Description != nil {
					comment = utils.Indent(*s.Properties[j].Description, "\t// ")
				}
				if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
					comment += "\n"
				}
				content += comment
				// struct member name and type, as part of struct definition
				content += fmt.Sprintf("\t%v %v\n", j, typ)
			}
		}
		content += "}\n"
	}
	return content
}
