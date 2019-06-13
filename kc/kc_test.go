package kc_test

import (
	"fmt"

	"github.com/taskcluster/generic-worker/kc"
)

func ExampleEncode() {
	fmt.Printf("%x\n", kc.Encode([]byte(`mysecretpassword`)))
	// 11 byte password should be 11 bytes when encoded
	fmt.Printf("%x\n", kc.Encode([]byte(`fredmary123`)))
	// 12 byte password should be 22 bytes when encoded (since encoded
	// passwords should always be a multiple of 11 bytes)
	fmt.Printf("%x\n", kc.Encode([]byte(`fredmary1234`)))
	fmt.Printf("%x\n", kc.Encode([]byte(`12345!@#$%{}PO"we[]{*&$!#+^ffdSWrhd4b#`)))
	// Output:
	// 10f02146b1ceb89ed3d86c0efe3d51b6bcddeaa3b91f
	// 1bfb3747bfddaf93928b2c
	// 1bfb3747bfddaf93928b2c49895223d2bcddeaa3b91f
	// 4cbb6117e79d9dc9879c6400d91d01a5d986b7d8933959a871088cdabb8ef0ee6d15ed6641f1bcddeaa3b91f
}

func ExampleDecode() {
	// Check case of no null byte terminator (password multiple of 11 bytes)
	fmt.Println(string(kc.Decode(kc.Encode([]byte("fredmary123")))))
	// Check case of null byte terminator (password not multiple of 11 bytes)
	fmt.Println(string(kc.Decode(kc.Encode([]byte("fredmary1234")))))
	// Output:
	// fredmary123
	// fredmary1234
}
