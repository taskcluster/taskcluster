exports.setupMockScopes = function (nock) { var scopes = []; var scope; scope = 
nock('https://login.live.com:443')
  .post('/accesstoken.srf', "grant_type=client_credentials&client_id=ms-app%3A%2F%2Fs-1-15-2-145565886-1510793020-2797717260-1526195933-3912359816-44086043-2211002316&client_secret=FF9yfJLxSH3uI32wNKGye643bAZ4zBz7&scope=notify.windows.com")
  .reply(200, "{\"token_type\":\"bearer\",\"access_token\":\"EgAaAQMAAAAEgAAACoAAv5SDH0jUnIisf1mVqwtvpYHgzopSTWYxOfsJy/6/iyFMNTMThjru7lsJXPeu4DjYVKKwHcgss5YmgnLSJH6Ic1v+Z4XtbcQLhwFuDBSgwLd1Ehs/aBDF6c1nOo7UpS5RuJrHOcLQkpGHM1aJcCs1gNp0nABdPNXp8DgbI94t6xuJAFoAiQAAAAAAaoEORPlLJFH5SyRR60gEAA0ANjcuMTg1LjE0OC44AAAAAABcAG1zLWFwcDovL3MtMS0xNS0yLTE0NTU2NTg4Ni0xNTEwNzkzMDIwLTI3OTc3MTcyNjAtMTUyNjE5NTkzMy0zOTEyMzU5ODE2LTQ0MDg2MDQzLTIyMTEwMDIzMTYA\",\"expires_in\":86400}", { 'cache-control': 'no-store',
  'content-length': '436',
  'content-type': 'application/json',
  server: 'Microsoft-IIS/7.5',
  ppserver: 'PPV: 30 H: BAYIDSLGN1I60 V: 0',
  date: 'Wed, 20 Feb 2013 04:07:21 GMT',
  connection: 'close' });
scopes.push(scope);scope = 
nock('https://bn1.notify.windows.com:443')
  .post('/?token=AgYAAACFGdWBiRCTypHebfvngI7DuNBXWuGjdiczDOZ7bSgkbCRrD2M1b10CpzCmipzknHbU4nLzapQbooXzJ%2fVwHAfSl%2fWMk8OsetohEVMlsIicoLP99rDg7g2AdENA99DZoAU%3d', "<tile><visual><binding template=\"TileWideSmallImageAndText02\"><image id=\"1\" src=\"http://textParam1.com\" alt=\"http://textParam2.com\"/><text id=\"1\">http://textParam3.com</text><text id=\"2\">http://textParam4.com</text><text id=\"3\">http://textParam5.com</text><text id=\"4\">http://textParam6.com</text><text id=\"5\">http://textParam7.com</text></binding></visual></tile>")
  .reply(200, "", { 'content-length': '0',
  'x-wns-notificationstatus': 'received',
  'x-wns-msg-id': '471DFCE3D872AF2',
  'x-wns-debug-trace': 'BN1WNS1011629',
  date: 'Wed, 20 Feb 2013 04:07:22 GMT' });
scopes.push(scope);return scopes; };