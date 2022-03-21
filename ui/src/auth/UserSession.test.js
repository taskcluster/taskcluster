import UserSession from './UserSession';

describe('UserSession', () => {
  it('should create user session', () => {
    const userSession = UserSession.create({
      identityProviderId: 'test-provider',
      encodedProfile:
        'eyJuYW1lIjoiVMOpc3QgTsOibcOoIiwiZW1haWwiOiJ0ZXN0QG1haWwifQ==',
    });

    expect(userSession.identityProviderId).toEqual('test-provider');
    expect(userSession).toHaveProperty('profile');
    expect(userSession.profile).toHaveProperty('name', 'Tést Nâmè');
    expect(userSession.profile).toHaveProperty('email', 'test@mail');
  });

  it('should serialize and deserialize session', () => {
    const userSession = UserSession.create({
      identityProviderId: 'test-provider',
      encodedProfile:
        'eyJuYW1lIjoiVMOpc3QgTsOibcOoIiwiZW1haWwiOiJ0ZXN0QG1haWwifQ==',
    });
    const serialized = userSession.serialize();

    expect(typeof serialized).toBe('string');
    const deserialized = UserSession.deserialize(serialized);

    expect(deserialized.identityProviderId).toEqual('test-provider');
    expect(deserialized).toHaveProperty('profile');
    expect(deserialized.profile).toHaveProperty('name', 'Tést Nâmè');
    expect(deserialized.profile).toHaveProperty('email', 'test@mail');
  });
});
