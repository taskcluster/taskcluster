package model

import (
	"fmt"
	"github.com/petemoore/taskcluster-client-go/codegenerator/utils"
)

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
)

`
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
