import React, { useState } from 'react';
import { string, object } from 'prop-types';
import { dump } from 'js-yaml';
import { Switch, Typography, Grid } from '@material-ui/core';
import Code from '../Code';
import 'highlight.js/styles/atom-one-dark.css';

const toYaml = obj => {
  return dump(obj);
};

const toJson = obj => {
  return JSON.stringify(obj, null, 2);
};

const YamlJsonSwitch = ({ handleChange, value }) => {
  return (
    <Typography component="div">
      <Grid component="label" container alignItems="center" spacing={1}>
        <Grid item>Yaml</Grid>
        <Grid item>
          <Switch
            checked={value === 'yaml'}
            onChange={handleChange}
            name="yaml_json_switch"
          />
        </Grid>
        <Grid item>Json</Grid>
      </Grid>
    </Typography>
  );
};

const JsonDisplay = props => {
  const [language, setLanguage] = useState(props.language);
  const toText = language === 'yaml' ? toYaml : toJson;

  return (
    <React.Fragment>
      <YamlJsonSwitch
        value={language}
        handleChange={() => {
          setLanguage(language === 'yaml' ? 'json' : 'yaml');
        }}
      />
      <Code {...props}>{toText(props.toDisplay)}</Code>
    </React.Fragment>
  );
};

JsonDisplay.propTypes = {
  /**
   * The content object to be serialized to yaml/json.
   */
  toDisplay: object.isRequired,
  /**
   * A highlight.js language identifier.
   */
  language: string.isRequired,
  /** The CSS class name of the wrapper element */
  className: string,
};

JsonDisplay.defaultProps = {
  className: null,
};

export default JsonDisplay;
