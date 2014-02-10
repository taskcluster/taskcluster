exports.setupMockScopes = function (nock) { var scopes = []; var scope; scope = 
nock('https://login.live.com:443')
  .post('/accesstoken.srf', "grant_type=client_credentials&client_id=foo&client_secret=bar&scope=notify.windows.com")
  .reply(400, "{\"error\":\"invalid_client\",\"error_description\":\"Invalid client id\"}", { 'cache-control': 'no-store',
  'content-length': '66',
  'content-type': 'application/json',
  server: 'Microsoft-IIS/7.5',
  'x-wlid-error': '0x80045A78',
  ppserver: 'PPV: 30 H: BAYIDSLGN1K28 V: 0',
  date: 'Tue, 19 Jun 2012 22:24:36 GMT',
  connection: 'close' });
scopes.push(scope);return scopes; };