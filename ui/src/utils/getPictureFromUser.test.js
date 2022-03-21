import getPictureFromUser from './getPictureFromUser';

describe('get picture from user', () => {
  it('should fetch mozilla-auth', () => {
    const user = {
      identityProviderId: 'mozilla-auth0',
      profile: {
        picture: 'https://example.com/picture.jpg',
      },
    };

    expect(getPictureFromUser(user)).toEqual('https://example.com/picture.jpg');
  });
  it('should fetch github', () => {
    const user = {
      identityProviderId: 'github',
      profile: {
        photos: [
          {
            value: 'https://example.com/picture.jpg',
          },
        ],
      },
    };

    expect(getPictureFromUser(user)).toEqual('https://example.com/picture.jpg');
  });
});
