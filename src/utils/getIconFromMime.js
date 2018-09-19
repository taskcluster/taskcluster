import { MIMETYPE_ICONS } from './constants';

// Matching patterns for finding an icon from a mimetype, most specific
// mimetype are listed first as they are matched top down.
export default contentType => {
  const [icon] = MIMETYPE_ICONS.find(([, matches]) =>
    matches.some(
      pattern =>
        pattern instanceof RegExp
          ? pattern.test(contentType)
          : pattern === contentType
    )
  );

  return icon;
};
