// whproxy is a Layer-7 proxy implementation. It uses WebSockets to
// communicate with clients. Incoming http and websocket requests are
// multiplexed as separate streams over a WS connection. It uses JWT
// for auth.
//
// browser ----> [ proxy ] <--- websocket --- client
//
// proxy serves endpoints exposed by client to browsers.
package whproxy
