exports.setupMockScopes = function (nock) { var scopes = []; var scope; scope = 
nock('https://login.live.com:443')
  .post('/accesstoken.srf', "grant_type=client_credentials&client_id=ms-app%3A%2F%2Fs-1-15-2-145565886-1510793020-2797717260-1526195933-3912359816-44086043-2211002316&client_secret=FF9yfJLxSH3uI32wNKGye643bAZ4zBz7&scope=notify.windows.com")
  .reply(200, "{\"token_type\":\"bearer\",\"access_token\":\"EgAaAQMAAAAEgAAACoAA2r5O9ilqrrHBFZOue+KF3ddXpogmXRBwlqyN26eOqN5N0QhbIeGQy59/RNfKAXqHmit5clEJagmmzW4+mtRrKWlBhjNHjfnCDbduWuXU6D7xwngI7IDxx8UfhzE8v043V3WaLz2GpRPpcD7p3k21xsNyqBCsrKUQgpdsKUyds5WJAFoAiQAAAAAAaoEORJRJJFGUSSRR60gEAA0ANjcuMTg1LjE0OC44AAAAAABcAG1zLWFwcDovL3MtMS0xNS0yLTE0NTU2NTg4Ni0xNTEwNzkzMDIwLTI3OTc3MTcyNjAtMTUyNjE5NTkzMy0zOTEyMzU5ODE2LTQ0MDg2MDQzLTIyMTEwMDIzMTYA\",\"expires_in\":86400}", { 'cache-control': 'no-store',
  'content-length': '436',
  'content-type': 'application/json',
  server: 'Microsoft-IIS/7.5',
  ppserver: 'PPV: 30 H: BAYIDSLGN2C023 V: 0',
  date: 'Wed, 20 Feb 2013 03:57:08 GMT',
  connection: 'close' });
scopes.push(scope);scope = 
nock('https://bn1.notify.windows.com:443')
  .post('/?token=AgYAAACFGdWBiRCTypHebfvngI7DuNBXWuGjdiczDOZ7bSgkbCRrD2M1b10CpzCmipzknHbU4nLzapQbooXzJ%2fVwHAfSl%2fWMk8OsetohEVMlsIicoLP99rDg7g2AdENA99DZoAU%3d', "<tile><visual lang=\"en-us\"><binding template=\"TileSquareText04\"><text id=\"1\">Sample text 1</text></binding><binding template=\"TileWideText03\"><text id=\"1\">Sample wide text 2</text></binding></visual></tile>")
  .reply(200, "", { 'content-length': '0',
  'x-wns-notificationstatus': 'received',
  'x-wns-msg-id': '2D17C05D707E38FE',
  'x-wns-debug-trace': 'BN1WNS1011532',
  date: 'Wed, 20 Feb 2013 03:57:09 GMT' });
scopes.push(scope);return scopes; };