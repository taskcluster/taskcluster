import React, { Component } from 'react';
import { string } from 'prop-types';
import withStyles from '@mui/styles/withStyles';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ContentCopyIcon from '@mui/icons-material/FileCopy';
import CheckIcon from '@mui/icons-material/Check';
import Code from '../Code';

@withStyles(theme => ({
  container: {
    position: 'relative',
    marginBottom: theme.spacing(2),
  },
  copyButton: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
    color: theme.palette.common.white,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    '&:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
  },
  code: {
    borderRadius: 4,
    fontSize: '0.875rem',
    '& pre': {
      margin: 0,
      padding: `${theme.spacing(2)} !important`,
      paddingRight: `${theme.spacing(6)} !important`, // Make room for copy button
    },
  },
}))
export default class CodeExample extends Component {
  static propTypes = {
    /** The code example to display */
    code: string.isRequired,
    /** Programming language for syntax highlighting */
    language: string.isRequired,
  };

  state = {
    copied: false,
  };

  handleCopy = () => {
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    const { code, language, classes } = this.props;
    const { copied } = this.state;
    // Map our language names to highlight.js language names
    const languageMap = {
      curl: 'bash',
      go: 'go',
      python: 'python',
      pythonAsync: 'python',
      node: 'javascript',
      web: 'javascript',
      rust: 'rust',
      shell: 'bash',
    };
    const hlLanguage = languageMap[language] || language;

    return (
      <div className={classes.container}>
        <CopyToClipboard text={code} onCopy={this.handleCopy}>
          <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
            <IconButton
              className={classes.copyButton}
              size="small"
              aria-label="copy code to clipboard">
              {copied ? <CheckIcon /> : <ContentCopyIcon />}
            </IconButton>
          </Tooltip>
        </CopyToClipboard>
        <Code language={hlLanguage} className={classes.code}>
          {code}
        </Code>
      </div>
    );
  }
}
