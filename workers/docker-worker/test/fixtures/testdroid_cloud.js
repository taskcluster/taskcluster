import App from 'koa';
import json from 'koa-json';

let app = new App();

function route(path) {
  switch (path || true) {
    case '/oauth/token':
      return {
        refresh_token: '12345',
        access_token: '67890',
        expires_in: 60 * 60
      }
    case '/api/v2/label-groups?search=Codename':
      return {
        data:
          [
            {
              displayName: 'Codename',
              id: '25'
            }
          ]
      };
    case '/api/v2/label-groups/25/labels?search=flame-kk':
      return {
        data:
          [
            {
              displayName: 'flame-kk',
              id: '52'
            }
          ]
      };
    case '/api/v2/label-groups?search=SIMs':
      return {
        data:
          [
            {
              displayName: 'SIMs',
              id: '73'
            }
          ]
      };
    case '/api/v2/label-groups/73/labels?search=1':
      return {
        data:
          [
            {
              displayName: '1',
              id: '37'
            }
          ]
      };
    case '/api/v2/devices?limit=0&label_id%5B%5D=52%2C37':
      return {
        data:
          [
            {
              id: 210,
              displayName: 'phone1',
              online: true,
              locked: false
            }
          ]
      }
    default:
      return 'hi';
  }

}

app.use(json());

app.use(function* () {
  var url = route(this.url);
  this.body = url;
});

module.exports = app;
