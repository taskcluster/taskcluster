"use strict";

var enforceHTTPS = function(trustProxy) {
	return function(req, res, next) {

		// First, check if directly requested via https
		var isHttps = req.secure;

		// Second, if the request headers can be trusted (e.g. because they are send
		// by a proxy), check if x-forward-proto is set to https
		if(!isHttps && trustProxy) {
			isHttps = (req.headers["x-forwarded-proto"] === "https");
		}

		if(isHttps) {
			next();
		} else {
			// Only redirect GET methods 
			if(req.method === "GET") {
				res.redirect(301, "https://" + req.headers.host + req.originalUrl);
			} else { 
				res.send(403, "Please use HTTPS when submitting data to this server.");
			}
		}
	}
};

exports.HTTPS = enforceHTTPS;