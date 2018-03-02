const assume = require('assume');
const {encode, decode} = require('../src/utils');

suite('utils', function() {
  suite('encoding', () => {
    test('encode does not encode the pipe symbol', () => {
      const result = encode('ad|Mozilla-LDAP|haali');

      assume(result).to.equal('ad|Mozilla-LDAP|haali');
    });

    test('encode encodes % to !', () => {
      const result = encode('ad|Mozilla-LDAP|^haali^');

      assume(result).to.equal('ad|Mozilla-LDAP|!5Ehaali!5E');
    });
  });

  suite('decoding', () => {
    test('decode works with no special characters', () => {
      const str = 'ad|Mozilla-LDAP|haali';
      const encoded = encode(str);

      assume(decode(encoded)).to.equal(str);
    });

    test('decode works with special characters', () => {
      const str = 'ad|Mozilla-LDAP|^haali^';
      const encoded = encode(str);

      assume(decode(encoded)).to.equal(str);
    });
  });

  suite('encode/decode', () => {
    const roundTrip = (name, decoded, encoded) => {
      test(name, function() {
        assume(encode(decoded)).to.equal(encoded);
        assume(decode(encoded)).to.equal(decoded);
      });
    };

    roundTrip('simple string', 'abc', 'abc');
    roundTrip('string with all legal client punctuation characters except / does not get encoded',
      '@:.+|_-', '@:.+|_-');
    roundTrip('string with /', 'a/b/c', 'a!2Fb!2Fc');
    roundTrip('string with ~ (not legal in clientId)', 'a~z', 'a!7Ez');
    roundTrip('string with } (not legal in clientId)', 'a}z', 'a!7Dz');
    roundTrip('string with !', 'wow!!', 'wow!21!21');
    roundTrip('string with %', 'wow!%!', 'wow!21!25!21');
    roundTrip('already-encoded', encode('wow!!'), encode('wow!21!21'));

    const validClientIdChar = /[A-Za-z0-9@/:.+|_-]/;
    const hex = i => {
      const h = i.toString(16).toUpperCase();
      return h.length === 2 ? `!${h}` : `!0${h}`;
    };
    for (let i = 1; i <= 0x7e; i++) {
      const c = String.fromCharCode(i);
      if (validClientIdChar.test(c) && c !== '/') {
        roundTrip(`chr(${i}) (literal)`, c, c);
      } else {
        roundTrip(`chr(${i}) (encoded)`, c, hex(i));
      }
    }
  });
});
