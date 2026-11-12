import React from 'react';
import { string, bool } from 'prop-types';
import { makeStyles } from 'tss-react/mui';
import classNames from 'classnames';
import parser from 'markdown-it';

const useStyles = makeStyles()(theme => ({
  /** Default styles applied to markdown content. */
  markdown: {
    '& code': {
      color: theme.palette.text.primary,
      backgroundColor: theme.palette.text.disabled,
      padding: theme.spacing(0.25),
    },
  },
  /** Inverse styles applied to markdown content (used for tooltip titles) */
  inverse: {
    '& code': {
      color: theme.palette.common.black,
      backgroundColor: theme.palette.common.white,
      padding: theme.spacing(0.25),
    },
  },
}));

function Markdown({ children = '', inverse = false }) {
  /**
   * Generate classes to define overall style for the schema table.
   */
  const { classes } = useStyles();
  const markdown = parser({ linkify: true });

  return (
    <span
      className={classNames(
        { [`${classes.markdown}`]: !inverse },
        { [`${classes.inverse}`]: inverse }
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: rendering markdown is the purpose of this component
      dangerouslySetInnerHTML={{
        __html: markdown.renderInline(children),
      }}
    />
  );
}

Markdown.propTypes = {
  /** Markdown content */
  children: string,
  /** Whether an inverse style should be applied or not */
  inverse: bool,
};

export default React.memo(Markdown);
