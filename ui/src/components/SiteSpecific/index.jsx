import React from 'react';
import { arrayOf, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import Paper from '@material-ui/core/Paper';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import { siteSpecificVariables } from '../../utils/siteSpecific';

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
  // included automatically
  'root_url',

  // WARNING: any changes to this list should be reflected
  //   ui/docs/manual/deploying/ui.mdx
  // See that file for descriptions of each variable.
  'github_app_url',
  'tutorial_worker_pool_id',
  'notify_email_sender',
  'notify_matrix_bot_name',
  'notify_slack_bot_name',
  'cloud_credentials_docs_url',
]);
// apply a simple templating language here, translating
// %IDENTIFIER% into a lookup of that identifier, and
// rendering the whole card to nothing if a lookup fails.
//
// Identifiers can be `root_url` for the site root URL (which
// does not exist for docs.taskcluster.net), or a value from
// SITE_SPECIFIC, as described above.
//
// THe sense of the component is reversed if `showIfNotSet` is
// given; in this case, if all of the given variables are set,
// the content will not be shown.  This is used to include a
// box in cases when variables aren't available, as a kind of
// "else clause".
//
// the result is rendered as Markdown.
const SiteSpecific = ({ classes, showIfNotSet, children }) => {
  let rendered;
  const variables = siteSpecificVariables();

  // bail out if the "showIf.." condition is not met
  if (showIfNotSet) {
    if (showIfNotSet.every(v => variables[v])) {
      return null;
    }
  }

  try {
    rendered = children.replace(/%([a-zA-Z0-9_]+)%/g, (_, ident) => {
      let result;

      if (SITE_SPECIFIC_VARS.has(ident)) {
        result = variables[ident];
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
  showIfNotSet: arrayOf(string),
};

export default styles(SiteSpecific);
