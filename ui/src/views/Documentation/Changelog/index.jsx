import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { withRouter } from 'react-router-dom';
import memoize from 'fast-memoize';
import { titleCase } from 'title-case';
import Grid from '@material-ui/core/Grid';
import Autocomplete from '@material-ui/lab/Autocomplete/Autocomplete';
import { compareVersions, validate } from 'compare-versions';
import Checkbox from '@material-ui/core/Checkbox';
import { FormControlLabel } from '@material-ui/core';
import Markdown from '../../../components/Markdown';
import ChangelogMd from '../../../../../CHANGELOG.md';
import TextField from '../../../components/TextField';

const parseMarkdownIntoSections = markdown => {
  const lines = markdown.split('\n');
  const sections = [];
  let version = '';
  let audience = '';
  let content = [];
  let id = 0;

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
    sections.push({ version, audience, content, html: content.join('\n'), id });
    id += 1;
  }

  return sections;
};

const FILTERS = ['version', 'from', 'to', 'q', 'all', 'audience'];

@withRouter
@withStyles(theme => ({
  md: {
    '& strong': {
      background: theme.palette.secondary.main,
      fontWeight: 'bold',
    },
  },
  cbx: {
    marginTop: theme.spacing(2),
  },
}))
export default class Changelog extends Component {
  static propTypes = {};

  constructor(props) {
    super(props);

    this.sections = parseMarkdownIntoSections(ChangelogMd);
    this.versions = [
      ...new Set([...this.sections.map(section => section.version)]),
    ].map(version => ({ label: version, value: version }));

    this.audiences = [
      ...new Set([...this.sections.map(section => section.audience)]),
    ].map(audience => ({ label: titleCase(audience), value: audience }));

    const search = new URLSearchParams(this.props.location.search);

    this.state = {
      version: search.get('version', ''),
      from: search.get('from', ''),
      to: search.get('to', ''),
      q: search.get('q', ''),
      all: search.get('all', ''),
      audience: search.get('audience', ''),
    };
  }

  filteredSections = memoize(
    ({ version, from, to, q, all, audience }) => {
      return this.sections.filter(section => {
        if (audience && section.audience !== audience) {
          return false;
        }

        if (q && !section.html.includes(q)) {
          return false;
        }

        if (version) {
          return section.version.includes(version);
        }

        if (!all || from || to) {
          if (!validate(section.version)) {
            return false;
          }

          const releaseFrom = from || (all ? '0.0.0' : '45.0.0');
          const releaseTo = to || '999.999.999';

          if (
            compareVersions(section.version, releaseFrom) < 0 ||
            compareVersions(section.version, releaseTo) > 0
          ) {
            return false;
          }
        }

        return true;
      });
    },
    {
      serializer: ({ version, from, to, q, all, audience }) =>
        `${version}-${from}-${to}-${q}-${all ? '1' : ''}-${audience}`,
    }
  );

  componentDidUpdate(prevProps, prevState) {
    if (FILTERS.map(key => prevState[key] !== this.state[key]).some(a => a)) {
      this.updateUrl();
    }
  }

  updateUrl() {
    const { history, location } = this.props;
    const newSearchParams = new URLSearchParams(location.search);

    FILTERS.forEach(key => {
      if (this.state[key]) {
        newSearchParams.set(key, this.state[key]);
      } else {
        newSearchParams.delete(key);
      }
    });

    history.push({ search: newSearchParams.toString() });
  }

  render() {
    const dropdowns = {
      version: 'Choose version',
      from: 'Version from',
      to: 'Version to',
    };
    const maybeHighlight = (text, q) =>
      q ? text.replace(new RegExp(`(${q})(?![^<>]*>)`, 'gi'), '**$1**') : text;

    return (
      <Grid container spacing={1}>
        {Object.entries(dropdowns).map(([key, label]) => (
          <Grid item xs={4} key={key}>
            <Autocomplete
              options={this.versions}
              getOptionLabel={option => option.label}
              onInputChange={(event, value) => this.setState({ [key]: value })}
              defaultValue={{ label: this.state[key], value: this.state[key] }}
              renderInput={params => (
                <TextField {...params} label={label} fullWidth />
              )}
            />
          </Grid>
        ))}
        <Grid item xs={4}>
          <TextField
            label="Search for a keyword"
            value={this.state.q}
            fullWidth
            onChange={ev => this.setState({ q: ev.target.value })}
          />
        </Grid>
        <Grid item xs={4}>
          <Autocomplete
            options={this.audiences}
            getOptionLabel={option => option.label}
            onInputChange={(event, value) => this.setState({ audience: value })}
            defaultValue={{
              label: this.state.audience,
              value: this.state.audience,
            }}
            renderInput={params => (
              <TextField {...params} label="Audience" fullWidth />
            )}
          />
        </Grid>
        <Grid item xs={4}>
          <FormControlLabel
            className={this.props.classes.cbx}
            control={
              <Checkbox
                checked={this.state.all}
                onChange={ev => this.setState({ all: ev.target.checked })}
                value="yes"
              />
            }
            label="Include old versions"
          />
        </Grid>
        {this.filteredSections(this.state).map(section => (
          <Grid key={section.id} item xs={12}>
            <h2>
              {section.version} :: {section.audience}
            </h2>
            <Markdown className={this.props.classes.md}>
              {maybeHighlight(section.html, this.state.q)}
            </Markdown>
          </Grid>
        ))}
      </Grid>
    );
  }
}
