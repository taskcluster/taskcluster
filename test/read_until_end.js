module.exports = function readUntilEnd(req) {
	return new Promise(function(accept, reject) {
		req.once('response', function(stream) {
			var buffer = '';
			stream.on('data', function(b) {
				buffer += b;
			});
			stream.once('error', reject)
			stream.once('end', function() {
				accept(buffer);
			});
		});
	});
}
