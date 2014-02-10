exports.setupMockScopes = function (nock) { var scopes = []; var scope; scope = 
nock('https://login.live.com:443')
  .post('/accesstoken.srf', "grant_type=client_credentials&client_id=ms-app%3A%2F%2Fs-1-15-2-3004590818-3540041580-1964567292-460813795-2327965118-1902784169-2945106848&client_secret=N3icDsX5JXArJJR6AdTQZ86RITXQnMmA&scope=notify.windows.com")
  .reply(200, "{\"token_type\":\"bearer\",\"access_token\":\"EgAfAQMAAAAEgAAACoAAh0nFBmzsPNEe9a6CD8jtoI7c6KM90VlTbYl8JuuTdXPoQ0QvKG/DyHAa+XotONpwwxqJyuhVdD5+eDRtMiVG6r+dkGqOfX+AOxUEn3cgKVax3lQA25lk/4ENZMyH9tp/8M/MuSq3fKJ39+d9Ipq0r6uGXameTzhA409dxz36Q1KOAFoAjgAAAAAAys8LTCX84E8l/OBP60gEABAAMTMxLjEwNy4xNzQuMjQ4AAAAAABeAG1zLWFwcDovL3MtMS0xNS0yLTMwMDQ1OTA4MTgtMzU0MDA0MTU4MC0xOTY0NTY3MjkyLTQ2MDgxMzc5NS0yMzI3OTY1MTE4LTE5MDI3ODQxNjktMjk0NTEwNjg0OAA=\"}", { 'cache-control': 'no-store',
  'content-length': '425',
  'content-type': 'application/json',
  server: 'Microsoft-IIS/7.5',
  ppserver: 'PPV: 30 H: BAYIDSLGN1K22 V: 0',
  date: 'Tue, 19 Jun 2012 22:24:37 GMT',
  connection: 'close' });
scopes.push(scope);scope = 
nock('https://bn1.notify.windows.com:443')
  .post('/?token=invalidToken', "<tile><visual><binding template=\"TileSquareBlock\"><text id=\"1\">http://textParam1.com</text><text id=\"2\">http://textParam2.com</text></binding></visual></tile>")
  .reply(404, "", { 'content-length': '0',
  'x-wns-msg-id': '194F02A706CD6474',
  'x-wns-debug-trace': 'BN1WNS1011531',
  date: 'Tue, 19 Jun 2012 22:24:37 GMT' });
scopes.push(scope);return scopes; };