import classNames from 'classnames';
import { string, func } from 'prop-types';
import React, { Component } from 'react';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import TextField from '@material-ui/core/TextField';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import { THEME } from '../../utils/constants';

@withStyles(theme => {
  const borderColor =
    theme.palette.type === 'light'
      ? fade(THEME.BLACK, 0.23)
      : fade(THEME.WHITE, 0.23);

  return {
    tab: {
      flexGrow: 1,
    },
    tabContent: {
      marginTop: theme.spacing.unit,
      padding: theme.spacing.unit,
    },
    markdownContainer: {
      borderColor,
      borderWidth: 1,
      borderRadius: theme.shape.borderRadius,
      borderStyle: 'solid',
    },
  };
})
export default class Preview extends Component {
  static propTypes = {
    onValueChange: func,
    value: string,
    placeholder: string,
  };

  state = {
    tabValue: 0,
  };

  handleChange = (event, value) => {
    this.setState({ tabValue: value });
  };

  render() {
    const { value, onValueChange, placeholder, classes } = this.props;
    const { tabValue } = this.state;

    return (
      <div className={classNames(classes.tab)}>
        <Tabs value={tabValue} onChange={this.handleChange}>
          <Tab label="Write" />
          <Tab label="Preview" />
        </Tabs>
        <div
          className={classNames(classes.tabContent, {
            [classes.markdownContainer]: tabValue === 1,
          })}>
          {tabValue === 0 && (
            <TextField
              name="Write"
              placeholder={placeholder}
              onChange={onValueChange}
              fullWidth
              multiline
              rows={5}
              value={value}
            />
          )}
          {tabValue === 1 && <Markdown>{value}</Markdown>}
        </div>
      </div>
    );
  }
}
