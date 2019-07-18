package cfg

import (
	"fmt"
	"reflect"
	"strings"

	yaml "gopkg.in/yaml.v3"
)

// The configuration for a provider. This must at least have "providerType",
// plus any additional provider-specific properties.
type ProviderConfig struct {
	ProviderType string
	Data         map[string]interface{}
}

func (pc *ProviderConfig) UnmarshalYAML(node *yaml.Node) error {
	err := node.Decode(&pc.Data)
	if err != nil {
		return err
	}

	pt, ok := pc.Data["providerType"]
	if !ok {
		return fmt.Errorf("provider config must have a `providerType` property")
	}

	pc.ProviderType, ok = pt.(string)
	if !ok {
		return fmt.Errorf("provider config's `providerType` property must be a string")
	}
	delete(pc.Data, "providerType")

	return nil
}

// Unpack this ProviderConfig to a provider's configuration struct.  This will produce
// an error for any missing properties.  Note that recursion is not supported.
//
// Structs should be tagged with `provider:"name"`, with the name defaulting to the
// lowercased version of the field name.
func (pc *ProviderConfig) Unpack(out interface{}) error {
	outval := reflect.ValueOf(out)
	if outval.Kind() != reflect.Ptr || outval.IsNil() {
		return fmt.Errorf("expected a pointer, got %s", outval.Kind())
	}
	destval := reflect.Indirect(outval)
	if destval.Kind() != reflect.Struct {
		return fmt.Errorf("expected a pointer to struct, got &%s", destval.Kind())
	}
	desttype := destval.Type()
	numfield := desttype.NumField()
	for i := 0; i < numfield; i++ {
		// get the expected property name
		field := desttype.Field(i)
		var name string
		tag := field.Tag.Get("provider")
		if tag == "" {
			name = strings.ToLower(field.Name[:1]) + field.Name[1:]
		} else {
			name = tag
		}

		// get the value
		val, ok := pc.Data[name]
		if !ok {
			return fmt.Errorf("Configuration value `provider.%s` not found", name)
		}

		// check types and set the struct field
		destfield := destval.Field(i)
		gotval := reflect.ValueOf(val)
		if destfield.Type() != gotval.Type() {
			return fmt.Errorf("Configuration value `provider.%s` should have type %s", name, destfield.Type())
		}
		destfield.Set(gotval)
	}
	return nil
}
