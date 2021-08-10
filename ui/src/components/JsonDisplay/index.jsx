import React, { useState } from 'react';
import { string, object, oneOf } from 'prop-types';
import { dump } from 'js-yaml';
import { Switch, Typography, Grid } from '@material-ui/core';
import Code from '../Code';
import 'highlight.js/styles/atom-one-dark.css';

const JsonDisplay = props => {
  const YamlJsonSwitch = ({ handleChange, value }) => (
    <Typography component="div">
      <Grid component="label" container alignItems="center" spacing={1}>
        <Grid item>Json</Grid>
        <Grid item>
          <Switch
            checked={value === 'yaml'}
            onChange={handleChange}
            name="yaml_json_switch"
          />
        </Grid>
        <Grid item>Yaml</Grid>
      </Grid>
    </Typography>
  );
  const [language, setLanguage] = useState(props.syntax);
  const toText =
    language === 'yaml'
      ? obj => dump(obj)
      : obj => JSON.stringify(obj, null, 2);

  return (
    <React.Fragment>
      <YamlJsonSwitch
        value={language}
        handleChange={() => setLanguage(language === 'yaml' ? 'json' : 'yaml')}
      />
      <Code language={props.syntax} className={props.wrapperClassName}>
        {toText(props.objectContent)}
      </Code>
    </React.Fragment>
  );
};

JsonDisplay.propTypes = {
  objectContent: object.isRequired,
  syntax: oneOf(['yaml', 'json']),
  wrapperClassName: string,
};

JsonDisplay.defaultProps = {
  wrapperClassName: null,
};

export default JsonDisplay;
