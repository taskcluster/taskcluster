import React from 'react';
import { string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import Paper from '@material-ui/core/Paper';
import Markdown from '@mozilla-frontend-infra/components/Markdown';

const styles = withStyles(theme => ({
  root: {
    borderLeft: `5px solid ${theme.palette.specific.dark}`,
    backgroundColor: fade(theme.palette.specific.main, 0.2),
    padding: `${theme.spacing(1)}px ${theme.spacing(3)}px`,
    margin: `${theme.spacing(3)}px 0`,
    '& a': {
      ...theme.mixins.link,
    },
  },
}));
const SITE_SPECIFIC_VARS = new Set([
  // WARNING: any changes to this list should be reflected
  //   ui/docs/manual/deploying/ui.mdx
  // See that file for descriptions of each variable.
  'github_app_url',
]);
// apply a simple templating language here, translating
// %IDENTIFIER% into a lookup of that identifier, and
// rendering the whole card to nothing if a lookup fails.
//
// Identifiers can be `root_url` for the site root URL (which
// does not exist for docs.taskcluster.net), or a value from
// SITE_SPECIFIC, as described above.
//
// the result is rendered as Markdown.
const SiteSpecific = ({ classes, children }) => {
  let rendered;

  try {
    rendered = children.replace(/%([a-zA-Z0-9_]+)%/g, (_, ident) => {
      let result;

      if (ident === 'root_url') {
        result = window.env.TASKCLUSTER_ROOT_URL;
      } else if (SITE_SPECIFIC_VARS.has(ident)) {
        result = window.env.SITE_SPECIFIC && window.env.SITE_SPECIFIC[ident];
      } else {
        throw new Error(`No such site-specific variable ${ident}`);
      }

      if (!result) {
        const err = new Error();

        err.code = 'site-specific-variable-not-set';
        throw err;
      }

      return result;
    });
  } catch (err) {
    if (err.code === 'site-specific-variable-not-set') {
      // ignore the whole card..
      return null;
    }

    throw err;
  }

  return (
    <Paper square classes={{ root: classes.root }}>
      <Markdown>{rendered}</Markdown>
    </Paper>
  );
};

SiteSpecific.propTypes = {
  children: string.isRequired,
};

export default styles(SiteSpecific);
