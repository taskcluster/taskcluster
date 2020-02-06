package kc_test

import (
	"fmt"

	"github.com/taskcluster/generic-worker/kc"
)

func ExampleEncode() {
	fmt.Printf("%x\n", kc.Encode([]byte(`mysecretpassword`)))
	// 11 byte password should be 12 bytes when encoded
	fmt.Printf("%x\n", kc.Encode([]byte(`fredmary123`)))
	// 12 byte password should be 24 bytes when encoded (since encoded
	// passwords should always be a multiple of 12 bytes, but trailing
	// 0 byte is included in encoding, so 12 byte password is stored
	// as 13 bytes, meaning 24 bytes are needed not 12).
	fmt.Printf("%x\n", kc.Encode([]byte(`fredmary1234`)))
	fmt.Printf("%x\n", kc.Encode([]byte(`12345!@#$%{}PO"we[]{*&$!#+^ffdSWrhd4b#`)))
	// Output:
	// 10f02146b1ceb89ed3d86c0efe3d51b6bcddeaa3b91f7d89
	// 1bfb3747bfddaf93928b2c7d
	// 1bfb3747bfddaf93928b2c49895223d2bcddeaa3b91f7d89
	// 4cbb6117e79d9dc9879c6400d91d01a5d986b7d8933959a871088cdabb8ef0ee6d15ed6641f1bcddeaa3b91f7d895223
}

func ExampleDecode() {
	// Check case of no bytes after 0 byte terminator (password (12*n-1) bytes
	// for integer n, n > 0)
	fmt.Println(string(kc.Decode(kc.Encode([]byte("fredmary123")))))
	// Check case of trailing bytes after 0 byte terminator (password not
	// (12*n-1) bytes for integer n, n > 0)
	fmt.Println(string(kc.Decode(kc.Encode([]byte("fredmary1234")))))
	// Output:
	// fredmary123
	// fredmary1234
}
