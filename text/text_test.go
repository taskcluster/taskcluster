package text

import "fmt"

func ExampleIndent_basic() {
	fmt.Println("1.")
	fmt.Println(Indent("", "...."))
	fmt.Println("2.")
	fmt.Println(Indent("\n", "...."))
	fmt.Println("3.")
	fmt.Println(Indent("abcd\nefgh", "...."))
	fmt.Println("4.")
	fmt.Println(Indent("abcd\nefgh\n", "...."))
	fmt.Println("5.")
	fmt.Println(Indent("abcd\nefgh\n\n", "...."))
	fmt.Println("Done")

	// Output:
	// 1.
	//
	// 2.
	// ....
	//
	// 3.
	// ....abcd
	// ....efgh
	// 4.
	// ....abcd
	// ....efgh
	//
	// 5.
	// ....abcd
	// ....efgh
	// ....
	//
	// Done
}

func ExampleIndent_nested() {
	fmt.Println(Indent("func A(foo string) {\n"+Indent("a := []string{\n"+Indent("\"x\",\n\"y\",\n\"z\",\n", "\t")+"}\n", "\t")+"}\n", "=> "))
	fmt.Println("Done")

	// Output:
	// => func A(foo string) {
	// => 	a := []string{
	// => 		"x",
	// => 		"y",
	// => 		"z",
	// => 	}
	// => }
	//
	// Done
}
