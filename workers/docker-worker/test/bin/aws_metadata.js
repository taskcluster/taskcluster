#! /usr/bin/env babel-node --experimental
let app = require('../aws_metadata');
let port = process.env.PORT || 60044;
app.listen(port);
console.log('listening on %s', port);
