// Package wsproxy is a Layer-7 proxy implementation which uses WebSockets to
// communicate with clients. Incoming http and websocket requests are
// multiplexed as separate streams over a WS connection. It uses JWT
// for auth.
//
//     viewer ----> [ proxy ] <--- websocket --- client
//
// proxy serves endpoints exposed by client to viewers.
//
// This is a low-level part of websocktunnel; users should instead use the
// github.com/taskcluster/client class.
package wsproxy
