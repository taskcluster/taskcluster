import React, { useState } from 'react';
import { string, object, oneOf } from 'prop-types';
import { dump } from 'js-yaml';
import { Switch, Typography, Grid } from '@material-ui/core';
import Code from '../Code';
import 'highlight.js/styles/atom-one-dark.css';
import CopyToClipboardListItem from '../CopyToClipboardListItem';

const JsonDisplay = props => {
  const YamlJsonSwitch = ({ handleChange, value }) => (
    <Typography component="div">
      <Grid component="label" container alignItems="center" spacing={1}>
        <Grid item>JSON</Grid>
        <Grid item>
          <Switch
            checked={value === 'yaml'}
            onChange={handleChange}
            name="yaml_json_switch"
          />
        </Grid>
        <Grid item>YAML</Grid>
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
      <Grid container>
        <YamlJsonSwitch
          value={language}
          handleChange={() =>
            setLanguage(language === 'yaml' ? 'json' : 'yaml')
          }
        />
        <Grid item>
          <CopyToClipboardListItem
            tooltipTitle=""
            textToCopy={toText(props.objectContent)}
            primary=""
            secondary=""
          />
        </Grid>
      </Grid>
      <Code language={language} className={props.wrapperClassName}>
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
