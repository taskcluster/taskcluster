exports.setupMockScopes = function (nock) { var scopes = []; var scope; scope = 
nock('https://login.live.com:443')
  .post('/accesstoken.srf', "grant_type=client_credentials&client_id=ms-app%3A%2F%2Fs-1-15-2-145565886-1510793020-2797717260-1526195933-3912359816-44086043-2211002316&client_secret=FF9yfJLxSH3uI32wNKGye643bAZ4zBz7&scope=notify.windows.com")
  .reply(200, "{\"token_type\":\"bearer\",\"access_token\":\"EgAaAQMAAAAEgAAACoAAthLhpiAnq28mv/cy7eyJOn6G2hUkhuCvrVB93anVYpnsltQ6MEvv6Xr/nXW5AIR27b+IyF/KYedDEE+2NOBgMAVAlnYMoPg+DI1OmtP/Eu4fowNZF9p/ME76OEAE1vy7IybdYYsj8cF7gnxgckg+uLH3oDrz6qM21WZRoSREGlGJAFoAiQAAAAAAaoEORCVKJFElSiRR60gEAA0ANjcuMTg1LjE0OC44AAAAAABcAG1zLWFwcDovL3MtMS0xNS0yLTE0NTU2NTg4Ni0xNTEwNzkzMDIwLTI3OTc3MTcyNjAtMTUyNjE5NTkzMy0zOTEyMzU5ODE2LTQ0MDg2MDQzLTIyMTEwMDIzMTYA\",\"expires_in\":86400}", { 'cache-control': 'no-store',
  'content-length': '436',
  'content-type': 'application/json',
  server: 'Microsoft-IIS/7.5',
  ppserver: 'PPV: 30 H: BAYIDSLGN2G030 V: 0',
  date: 'Wed, 20 Feb 2013 03:59:32 GMT',
  connection: 'close' });
scopes.push(scope);scope = 
nock('https://bn1.notify.windows.com:443')
  .post('/?token=AgYAAACFGdWBiRCTypHebfvngI7DuNBXWuGjdiczDOZ7bSgkbCRrD2M1b10CpzCmipzknHbU4nLzapQbooXzJ%2fVwHAfSl%2fWMk8OsetohEVMlsIicoLP99rDg7g2AdENA99DZoAU%3d', "<toast duration=\"long\" launch=\"some random parameter passed to the application\"><visual><binding template=\"ToastText01\"><text id=\"1\">A toast!</text></binding></visual><audio src=\"ms-winsoundevent:Notification.Alarm\" loop=\"true\"/></toast>")
  .reply(200, "", { 'content-length': '0',
  'x-wns-notificationstatus': 'received',
  'x-wns-msg-id': '7CFCFDFF27001588',
  'x-wns-debug-trace': 'BN1WNS1011735',
  date: 'Wed, 20 Feb 2013 03:59:34 GMT' });
scopes.push(scope);return scopes; };