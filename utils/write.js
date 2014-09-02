var net = require('net');
var http = require('http');
var url = require('url');

var unix = __dirname + '/../input.sock';
var idx = 0;

var opts = url.parse('http://localhost:60022/log');
opts.method = 'PUT'
var client = http.request(opts);

setInterval(function() {
	client.write("### CHUNK" + (++idx) + " ###\r\n")
	client.write("Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?")
	client.write("\r\n### CHUNK END " + (idx) + " ###\r\n")
}, 10);
