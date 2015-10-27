package model

import (
	"fmt"
	"strings"

	"github.com/taskcluster/taskcluster-client-go/codegenerator/utils"
)

//////////////////////////////////////////////////////////////////
//
// From: http://schemas.taskcluster.net/base/v1/api-reference.json
//
//////////////////////////////////////////////////////////////////

type API struct {
	Version     interface{} `json:"version"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	BaseURL     string      `json:"baseUrl"`
	Entries     []APIEntry  `json:"entries"`

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
		result += fmt.Sprintf("Entry %-6v=\n%v", i, entry.String())
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
	// package name and variable name are ideally not the same
	// so find a way to make them different...
	// also don't allow type variable name to be the same as
	// the type name
	// e.g. switch case of first character, and if first
	// character is not can't switch case for whatever
	// reason, prefix variable name with "my"
	exampleVarName := api.apiDef.ExampleVarName
	exampleCall := ""
	// here we choose an example API method to call, just the first one in the list of api.Entries
	// We need to first see if it returns one or two variables...
	if api.Entries[0].Output == "" {
		exampleCall = "//  callSummary := " + exampleVarName + "." + api.Entries[0].MethodName + "(.....)"
	} else {
		exampleCall = "//  data, callSummary := " + exampleVarName + "." + api.Entries[0].MethodName + "(.....)"
	}
	comment := ""
	if api.Description != "" {
		comment = utils.Indent(api.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	comment += "//\n"
	comment += fmt.Sprintf("// See: %v\n", api.apiDef.DocRoot)
	comment += "//\n"
	comment += "// How to use this package\n"
	comment += "//\n"
	comment += "// First create " + utils.IndefiniteArticle(api.apiDef.Name) + " " + api.apiDef.Name + " object:\n"
	comment += "//\n"
	comment += "//  " + exampleVarName + " := " + api.apiDef.PackageName + ".New(\"myClientId\", \"myAccessToken\")\n"
	comment += "//\n"
	comment += "// and then call one or more of " + exampleVarName + "'s methods, e.g.:\n"
	comment += "//\n"
	comment += exampleCall + "\n"
	comment += "// handling any errors...\n"
	comment += "//  if callSummary.Error != nil {\n"
	comment += "//  	// handle error...\n"
	comment += "//  }\n"

	content := comment
	content += "package " + api.apiDef.PackageName + "\n"

	// note: we remove unused imports later, so e.g. if net/url is not used, it
	// will get removed later using:
	// https://godoc.org/golang.org/x/tools/imports

	content += `
import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"reflect"
	"github.com/taskcluster/httpbackoff"
	hawk "github.com/tent/hawk-go"
	D "github.com/tj/go-debug"
%%{imports}
)

var (
	// Used for logging based on DEBUG environment variable
	// See github.com/tj/go-debug
	debug = D.Debug("` + api.apiDef.PackageName + `")
)

// apiCall is the generic REST API calling method which performs all REST API
// calls for this library.  Each auto-generated REST API method simply is a
// wrapper around this method, calling it with specific specific arguments.
func (` + exampleVarName + ` *` + api.apiDef.Name + `) apiCall(payload interface{}, method, route string, result interface{}) (interface{}, *CallSummary) {
	callSummary := new(CallSummary)
	callSummary.HttpRequestObject = payload
	var jsonPayload []byte
	jsonPayload, callSummary.Error = json.Marshal(payload)
	if callSummary.Error != nil {
		return result, callSummary
	}
	callSummary.HttpRequestBody = string(jsonPayload)

	httpClient := &http.Client{}

	// function to perform http request - we call this using backoff library to
	// have exponential backoff in case of intermittent failures (e.g. network
	// blips or HTTP 5xx errors)
	httpCall := func() (*http.Response, error, error) {
		var ioReader io.Reader = nil
		if reflect.ValueOf(payload).IsValid() && !reflect.ValueOf(payload).IsNil() {
			ioReader = bytes.NewReader(jsonPayload)
		}
		httpRequest, err := http.NewRequest(method, ` + exampleVarName + `.BaseURL+route, ioReader)
		if err != nil {
			return nil, nil, fmt.Errorf("apiCall url cannot be parsed: '%v', is your BaseURL (%v) set correctly?\n%v\n", ` + exampleVarName + `.BaseURL+route, ` + exampleVarName + `.BaseURL, err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		callSummary.HttpRequest = httpRequest
		// Refresh Authorization header with each call...
		// Only authenticate if client library user wishes to.
		if ` + exampleVarName + `.Authenticate {
			credentials := &hawk.Credentials{
				ID:   ` + exampleVarName + `.ClientId,
				Key:  ` + exampleVarName + `.AccessToken,
				Hash: sha256.New,
			}
			reqAuth := hawk.NewRequestAuth(httpRequest, credentials, 0)
			if ` + exampleVarName + `.Certificate != "" {
				reqAuth.Ext = base64.StdEncoding.EncodeToString([]byte("{\"certificate\":" + ` + exampleVarName + `.Certificate + "}"))
			}
			httpRequest.Header.Set("Authorization", reqAuth.RequestHeader())
		}
		debug("Making http request: %v", httpRequest)
		resp, err := httpClient.Do(httpRequest)
		return resp, err, nil
	}

	// Make HTTP API calls using an exponential backoff algorithm...
	callSummary.HttpResponse, callSummary.Attempts, callSummary.Error = httpbackoff.Retry(httpCall)

	if callSummary.Error != nil {
		return result, callSummary
	}

	// now read response into memory, so that we can return the body
	var body []byte
	body, callSummary.Error = ioutil.ReadAll(callSummary.HttpResponse.Body)

	if callSummary.Error != nil {
		return result, callSummary
	}

	callSummary.HttpResponseBody = string(body)

	// if result is passed in as nil, it means the API defines no response body
	// json
	if reflect.ValueOf(result).IsValid() && !reflect.ValueOf(result).IsNil() {
		callSummary.Error = json.Unmarshal([]byte(callSummary.HttpResponseBody), &result)
		if callSummary.Error != nil {
			// technically not needed since returned outside if, but more comprehensible
			return result, callSummary
		}
	}

	// Return result and callSummary
	return result, callSummary
}

// The entry point into all the functionality in this package is to create ` + utils.IndefiniteArticle(api.apiDef.Name) + `
// ` + api.apiDef.Name + ` object.  It contains your authentication credentials, which are
// required for all HTTP operations.
type ` + api.apiDef.Name + ` struct {
	// Client ID required by Hawk
	ClientId string
	// Access Token required by Hawk
	AccessToken string
	// The URL of the API endpoint to hit.
	// Use ` + "\"" + api.BaseURL + "\"" + ` for production.
	// Please note calling ` + api.apiDef.PackageName + `.New(clientId string, accessToken string) is an
	// alternative way to create ` + utils.IndefiniteArticle(api.apiDef.Name) + " " + api.apiDef.Name + ` object with BaseURL set to production.
	BaseURL string
	// Whether authentication is enabled (e.g. set to 'false' when using taskcluster-proxy)
	// Please note calling ` + api.apiDef.PackageName + `.New(clientId string, accessToken string) is an
	// alternative way to create ` + utils.IndefiniteArticle(api.apiDef.Name) + " " + api.apiDef.Name + ` object with Authenticate set to true.
	Authenticate bool
	// Certificate for temporary credentials
	Certificate string
}

// CallSummary provides information about the underlying http request and
// response issued for a given API call, together with details of any Error
// which occured. After making an API call, be sure to check the returned
// CallSummary.Error - if it is nil, no error occurred.
type CallSummary struct {
	HttpRequest *http.Request
	// Keep a copy of request body in addition to the *http.Request, since
	// accessing the Body via the *http.Request object, you get a io.ReadCloser
	// - and after the request has been made, the body will have been read, and
	// the data lost... This way, it is still available after the api call
	// returns.
	HttpRequestBody string
	// The Go Type which is marshaled into json and used as the http request
	// body.
	HttpRequestObject interface{}
	HttpResponse      *http.Response
	// Keep a copy of response body in addition to the *http.Response, since
	// accessing the Body via the *http.Response object, you get a
	// io.ReadCloser - and after the response has been read once (to unmarshal
	// json into native go types) the data is lost... This way, it is still
	// available after the api call returns.
	HttpResponseBody string
	Error            error
	// Keep a record of how many http requests were attempted
	Attempts int
}

// Returns a pointer to ` + api.apiDef.Name + `, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false.
//
`
	content += "// For example:\n"
	content += "//  " + exampleVarName + " := " + api.apiDef.PackageName + ".New(\"123\", \"456\") " + strings.Repeat(" ", 20+len(apiName)-len(api.apiDef.PackageName)) + "  // set clientId and accessToken\n"
	content += "//  " + exampleVarName + ".Authenticate = false             " + strings.Repeat(" ", len(apiName)) + "           // disable authentication (true by default)\n"
	content += "//  " + exampleVarName + ".BaseURL = \"http://localhost:1234/api/" + apiName + "/v1\"   // alternative API endpoint (production by default)\n"
	content += exampleCall + strings.Repeat(" ", 48-len(exampleCall)+len(apiName)+len(exampleVarName)) + " // for example, call the " + api.Entries[0].MethodName + "(.....) API endpoint (described further down)...\n"
	content += "//  if callSummary.Error != nil {\n"
	content += "//  	// handle errors...\n"
	content += "//  }\n"
	content += "func New(clientId string, accessToken string) *" + api.apiDef.Name + " {\n"
	content += "\treturn &" + api.apiDef.Name + "{\n"
	content += "\t\tClientId: clientId,\n"
	content += "\t\tAccessToken: accessToken,\n"
	content += "\t\tBaseURL: \"" + api.BaseURL + "\",\n"
	content += "\t\tAuthenticate: true,\n"
	content += "\t}\n"
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

	responseType := "*CallSummary"
	if entry.Output != "" {
		responseType = "(*" + entry.Parent.apiDef.schemas[entry.Output].TypeName + ", *CallSummary)"
	}

	content := comment
	content += "func (" + entry.Parent.apiDef.ExampleVarName + " *" + entry.Parent.apiDef.Name + ") " + entry.MethodName + "(" + inputParams + ") " + responseType + " {\n"
	if entry.Output != "" {
		content += "\tresponseObject, callSummary := " + entry.Parent.apiDef.ExampleVarName + ".apiCall(" + apiArgsPayload + ", \"" + strings.ToUpper(entry.Method) + "\", \"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + url.QueryEscape(", -1), ">", ") + \"", -1) + "\", new(" + entry.Parent.apiDef.schemas[entry.Output].TypeName + "))\n"
		content += "\treturn responseObject.(*" + entry.Parent.apiDef.schemas[entry.Output].TypeName + "), callSummary\n"
	} else {
		content += "\t_, callSummary := " + entry.Parent.apiDef.ExampleVarName + ".apiCall(" + apiArgsPayload + ", \"" + strings.ToUpper(entry.Method) + "\", \"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + url.QueryEscape(", -1), ">", ") + \"", -1) + "\", nil)\n"
		content += "\treturn callSummary\n"
	}
	content += "}\n"
	content += "\n"
	// can remove any code that added an empty string to another string
	return strings.Replace(content, ` + ""`, "", -1)
}
