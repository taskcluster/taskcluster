import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { oneOf, string, arrayOf, shape } from 'prop-types';
import { fade, withStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import ListSubheader from '@material-ui/core/ListSubheader';
import Autocomplete from '@material-ui/lab/Autocomplete';
import MagnifyIcon from 'mdi-react/MagnifyIcon';
import Link from '../../utils/Link';
import { THEME } from '../../utils/constants';

@withRouter
@withStyles(
  theme => ({
    autoCompleteItem: {
      width: '100%',
      height: '100%',
    },
    searchRoot: {
      background: fade(THEME.PRIMARY_DARK, 0.5),
      '&:hover': {
        background: fade(THEME.PRIMARY_DARK, 0.9),
      },
      '& .MuiInput-underline:before': {
        borderBottom: 'unset !important',
      },
      '& .MuiSvgIcon-root': {
        fill: theme.palette.common.white,
      },
      '& .mdi-icon': {
        fill: fade(theme.palette.common.white, 0.5),
        marginRight: theme.spacing(1),
        height: 35,
      },
    },
    searchInputRoot: {
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(1),
      color: fade(THEME.PRIMARY_TEXT_DARK, 0.5),
      '&:focus': {
        color: fade(THEME.PRIMARY_TEXT_DARK, 0.9),
      },
    },
    groupItem: {
      textIndent: theme.spacing(1),
    },
    /* Styles applied to the group's label elements. */
    groupLabel: {
      backgroundColor: theme.palette.background.paper,
      top: -8,
    },

    /* Styles applied to the group's ul elements. */
    groupUl: {
      padding: 0,
    },
  }),
  { withTheme: true }
)
/**
 * An app-bar compatible search field for docs.
 */
export default class DocSearch extends Component {
  static propTypes = {
    options: arrayOf(
      shape({
        element: oneOf(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
        title: string,
        subtitle: string,
        id: string,
      })
    ).isRequired,
  };

  handleAutocompleteChange = (_, option) => {
    if (typeof option === 'string') {
      return;
    }

    this.props.history.push(this.linkFromOption(option));
  };

  linkFromOption = option => {
    const pathWithoutExtension = option.path.replace(/\.[^/.]+$/, '');

    return `/docs${pathWithoutExtension}#${option.id}`;
  };

  renderGroup = params => {
    const { classes } = this.props;
    const listKey = `${params.children[0].props.children.key.split('-')[0]}-${
      params.key
    }`;

    return (
      <li key={listKey}>
        <ListSubheader className={classes.groupLabel} component="div">
          {params.key}
        </ListSubheader>
        <ul className={classes.groupUl}>{params.children}</ul>
      </li>
    );
  };

  render() {
    const { options, classes } = this.props;
    const that = this;

    return (
      <Autocomplete
        classes={{
          root: classes.searchRoot,
          inputRoot: classes.searchInputRoot,
        }}
        onChange={this.handleAutocompleteChange}
        getOptionLabel={option =>
          typeof option === 'string' ? option : option.subtitle || option.title
        }
        groupBy={option => option.title}
        renderGroup={this.renderGroup}
        disableClearable
        options={options}
        style={{ width: 300 }}
        renderOption={option => {
          // handleRenderGroup relies on option.path showing up first
          // in Link's key prop
          return (
            <Link
              key={`${option.path}-${option.title}-${option.subtitle}`}
              className={classes.autoCompleteItem}
              to={that.linkFromOption(option)}>
              <Typography
                color="textSecondary"
                variant="body2"
                className={classes.groupItem}>
                {option.subtitle || option.title}
              </Typography>
            </Link>
          );
        }}
        renderInput={params => {
          return (
            <TextField
              {...params}
              InputProps={{
                ...params.InputProps,
                startAdornment: <MagnifyIcon />,
              }}
              placeholder="Search Documentation"
              fullWidth
            />
          );
        }}
      />
    );
  }
}
