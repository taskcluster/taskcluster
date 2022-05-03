import { b64DecodeUnicode, b64EncodeUnicode } from './base64';

describe('base64', () => {
  it('should decode ascii and non-ascii strings', () => {
    const testWords = ['', 'ū', 'foo', 'ûnicödë', '123-{}-456', 'юникод'];

    testWords.forEach(word => {
      const encoded = b64EncodeUnicode(word);

      expect(b64DecodeUnicode(encoded)).toEqual(word);
    });
  });
});
