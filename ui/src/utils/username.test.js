import username from './username';

describe('username', () => {
  it('should return name', () => {
    expect(
      username({ profile: { displayName: 'Üniсоде', username: 'ignored' } })
    ).toEqual('Üniсоде');
    expect(
      username({ profile: { displayName: 'John Doe', username: 'ignored' } })
    ).toEqual('John Doe');

    expect(username({ profile: { username: 'John Doe' } })).toEqual('John Doe');

    expect(username({ profile: { displayName: '', username: '' } })).toEqual(
      'unknown hero'
    );
    expect(username({ profile: null })).toEqual('unknown hero');
    expect(username({})).toEqual('unknown hero');
  });
});
