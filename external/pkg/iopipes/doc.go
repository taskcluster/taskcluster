// Package iopipes provides implementation for a few new sets of pipes.
//
// InfinitePipe provides a pipe that will grow indefinitely and never blocks.
// Because of the unbounded growth of the pipe, there should be an external
// syncronisation method to prevent what is effectively a memory leak.
//
// DrainingPipe provides a pipe that will block writes once the internal buffer
// reaches or exceeds a specified capacity. However, it will still accept and
// write to the buffer the data that exceeds the buffer. Once the capacity has
// been reached, the DrainingPipe goes into draining mode and will only unblock
// when the entire buffer is read.
package iopipes
