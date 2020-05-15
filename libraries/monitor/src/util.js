/**
 * Remove leading trailing cruft and dedent evenly any multiline
 * strings that were passed in with their indentation intact.
 *
 * Example:
 *
 * let x = `Foo
 *          bar
 *          baz`;
 *
 * Normally this prints as:
 *
 * Foo
 *         bar
 *         baz
 *
 * But after using this, it is:
 *
 * Foo
 * bar
 * baz
 */
const cleanupDescription = desc => {
  desc = desc.trim();
  const spl = desc.split('\n');

  if (spl.length < 2) {
    return desc;
  }

  const match = /^\s+/.exec(spl[1]); // The first line has already been trimmed
  if (match) {
    const remove = match[0].length;
    const fixed = spl.slice(1).map(l => l.slice(remove));
    return [spl[0], ...fixed].join('\n');
  }

  return desc;
};

exports.cleanupDescription = cleanupDescription;
