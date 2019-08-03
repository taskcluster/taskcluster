package codegen

import (
	"bytes"
	"fmt"
	"go/format"
	"reflect"
	"sort"
)

// Generator holds a buffer of the output that will be generated.
type Generator struct {
	buf bytes.Buffer
}

// Write writes arbitrary bytes to the buffer. This meets the requirements for
// the io.Writer interface.
func (g *Generator) Write(p []byte) (n int, err error) {
	return g.buf.Write(p)
}

// Printf prints the given format+args to the buffer.
func (g *Generator) Printf(format string, args ...interface{}) {
	fmt.Fprintf(&g.buf, format, args...)
}

// Print prints the given a to the buffer.
func (g *Generator) Print(a ...interface{}) {
	fmt.Fprint(&g.buf, a...)
}

// PrettyPrint pretty-prints arbitrary data.
//
// There are special rules for some composite types to ensure we have verbose
// output, but simple types such as strings and numbers are printed using the
// built-in `%#v` format filter.
func (g *Generator) PrettyPrint(data interface{}) {
	v := reflect.ValueOf(data)
	t := v.Type()

	switch v.Kind() {
	case reflect.Array, reflect.Slice:
		g.Printf("%s", t.String())
		if v.Kind() == reflect.Slice && v.IsNil() {
			g.Printf("(nil)")
			break
		}
		g.Print("{\n")
		for i := 0; i < v.Len(); i++ {
			g.PrettyPrint(v.Index(i).Interface())
			g.Print(",\n")
		}
		g.Print("}")
	case reflect.Struct:
		g.Printf("%s{\n", t.String())
		for i := 0; i < v.NumField(); i++ {
			g.Printf("%s: ", t.Field(i).Name)
			g.PrettyPrint(v.Field(i).Interface())
			g.Print(",\n")
		}
		g.Print("}")
	case reflect.Map:
		g.Printf("%s{\n", t.String())
		keys := v.MapKeys()
		if len(keys) == 0 {
			g.Print("}")
			break
		}
		// Because go's maps don't do stable ordering, we manually sort the maps
		// where keys are strings (our only usecase so far) to ensure we get
		// consistent outputs and reduce potential diffs.
		if t.Key().Kind() == reflect.String {
			sortedK := make([]string, 0, len(keys))
			for _, k := range keys {
				sortedK = append(sortedK, k.String())
			}
			sort.Strings(sortedK)
			for i := range sortedK {
				k := reflect.ValueOf(sortedK[i])
				g.Printf("%#v: ", sortedK[i])
				g.PrettyPrint(v.MapIndex(k).Interface())
				g.Print(",\n")
			}
		} else {
			// If the keys are not strings, we don't sort them for now.
			for i := 0; i < v.Len(); i++ {
				k := keys[i]
				g.Printf("%#v: ", k)
				g.PrettyPrint(v.MapIndex(k).Interface())
				g.Print(",\n")
			}
		}
		g.Print("}")
	default:
		g.Printf("%#v", v.Interface())
	}
}

// Format returns the formated contents of the Generator's buffer.
func (g *Generator) Format() ([]byte, error) {
	return format.Source(g.buf.Bytes())
}

// String returns a string representation of the Generator's buffer.
func (g *Generator) String() string {
	return g.buf.String()
}
