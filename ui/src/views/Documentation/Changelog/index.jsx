import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { withRouter } from 'react-router-dom';
import Grid from '@material-ui/core/Grid';
import Markdown from '../../../components/Markdown';
import ChangelogMd from '../../../../../CHANGELOG.md';

const parseMarkdownIntoSections = markdown => {
  const lines = markdown.split('\n');
  const sections = [];
  let version = '';
  let audience = '';
  let content = [];

  lines.forEach(line => {
    if (line.startsWith('## ')) {
      if (version) {
        sections.push({ version, audience, content, html: content.join('\n') });
      }

      version = line.slice(3);
      audience = '';
      content = [];
    } else if (line.startsWith('### ')) {
      if (audience) {
        sections.push({ version, audience, content, html: content.join('\n') });
        audience = '';
        content = [];
      }

      audience = line.slice(4);
    } else {
      content.push(line);
    }
  });

  if (version && version && content.length) {
    sections.push({ version, audience, content, html: content.join('\n') });
  }

  return sections;
};

@withRouter
@withStyles(theme => ({
  cardActionArea: {
    height: '100%',
    textAlign: 'center',
  },
  avatar: {
    height: 80,
    width: 80,
    margin: `0 auto ${theme.spacing(1)}px auto`,
    boxShadow: '0px 0px 4px rgba(2,2,2,0.2)',
  },
}))
export default class Changelog extends Component {
  static propTypes = {};

  constructor(props) {
    super(props);
    this.state = {
      sections: parseMarkdownIntoSections(ChangelogMd),
    };
  }

  render() {
    const { sections } = this.state;

    return (
      <Grid container spacing={1}>
        {sections.map(section => (
          <Grid key={section.version} item xs={12}>
            <h2>
              {section.version} :: {section.audience}
            </h2>
            <Markdown>{section.html}</Markdown>
          </Grid>
        ))}
      </Grid>
    );
  }
}
