#! /usr/bin/env node --harmony
var app = require('../aws_metadata');
var port = process.env.PORT || 60044;
app.listen(port);
console.log('listening on %s', port)
