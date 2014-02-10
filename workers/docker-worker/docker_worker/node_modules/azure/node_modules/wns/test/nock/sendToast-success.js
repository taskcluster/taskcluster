exports.setupMockScopes = function (nock) { var scopes = []; var scope; scope = 
nock('https://login.live.com:443')
  .post('/accesstoken.srf', "grant_type=client_credentials&client_id=ms-app%3A%2F%2Fs-1-15-2-145565886-1510793020-2797717260-1526195933-3912359816-44086043-2211002316&client_secret=FF9yfJLxSH3uI32wNKGye643bAZ4zBz7&scope=notify.windows.com")
  .reply(200, "{\"token_type\":\"bearer\",\"access_token\":\"EgAaAQMAAAAEgAAACoAAuL10PFqcdv0lmsHBpVZzH/pKTJBnbU4JWgZn4+hygQYXzpeINc6oysjTl7XLO8dCZOC3b+Vtujc/KVae8oCCuz3frfbxSAPEyC406VVefqs8i/Xxkg3o5YkjvzSR5WuUEph8iDDWrPcuPO/96XnDySXeUqMVFlXiio00j54AJLSJAFoAiQAAAAAAaoEORHhJJFF4SSRR60gEAA0ANjcuMTg1LjE0OC44AAAAAABcAG1zLWFwcDovL3MtMS0xNS0yLTE0NTU2NTg4Ni0xNTEwNzkzMDIwLTI3OTc3MTcyNjAtMTUyNjE5NTkzMy0zOTEyMzU5ODE2LTQ0MDg2MDQzLTIyMTEwMDIzMTYA\",\"expires_in\":86400}", { 'cache-control': 'no-store',
  'content-length': '436',
  'content-type': 'application/json',
  server: 'Microsoft-IIS/7.5',
  ppserver: 'PPV: 30 H: BAYIDSLGN1K36 V: 0',
  date: 'Wed, 20 Feb 2013 03:56:40 GMT',
  connection: 'close' });
scopes.push(scope);scope = 
nock('https://bn1.notify.windows.com:443')
  .post('/?token=AgYAAACFGdWBiRCTypHebfvngI7DuNBXWuGjdiczDOZ7bSgkbCRrD2M1b10CpzCmipzknHbU4nLzapQbooXzJ%2fVwHAfSl%2fWMk8OsetohEVMlsIicoLP99rDg7g2AdENA99DZoAU%3d', "<toast><visual lang=\"en-us\"><binding template=\"ToastText01\"><text id=\"1\">Sample text 4</text></binding><binding template=\"ToastText02\"><text id=\"1\">Sample text1</text><text id=\"2\">Sample text 5</text></binding></visual><audio src=\"ms-winsoundevent:Notification.Alarm\" loop=\"true\"/></toast>")
  .reply(200, "", { 'content-length': '0',
  'x-wns-notificationstatus': 'received',
  'x-wns-msg-id': 'EC93748029FB88A',
  'x-wns-debug-trace': 'BN1WNS2011536',
  date: 'Wed, 20 Feb 2013 03:56:40 GMT' });
scopes.push(scope);return scopes; };