import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { object, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import Grid from '@material-ui/core/Grid';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import SchemaTable from '../../../components/SchemaTable';

const primaryTypographyProps = { variant: 'body1' };

@withRouter
@withStyles(
  () => ({
    expansionPanelSummary: {
      margin: 0,
    },
    list: {
      width: '100%',
    },
    gridContainer: {
      '& > div': {
        margin: 'auto',
      },
    },
  }),
  { withTheme: true }
)
export default class SchemaPanel extends Component {
  static propTypes = {
    /** The reference entry. */
    entry: object.isRequired,
    /** The service name in which the entry belongs to. */
    serviceName: string.isRequired,
  };

  state = {
    expanded: false,
  };

  renderExpansionPanelSummary = () => {
    const { entry, classes } = this.props;

    return (
      <Grid className={classes.gridContainer} container spacing={8}>
        <Grid item xs={5}>
          <div>
            <Typography id={entry.content.$id} component="h3">
              {entry.content.title}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={7}>
          <div>
            <Typography>{entry.content.$id}</Typography>
          </div>
        </Grid>
      </Grid>
    );
  };

  renderSchemaTable = (schema, headerTitle) => (
    <ListItem>
      <ListItemText
        primaryTypographyProps={primaryTypographyProps}
        disableTypography
        primary={<Typography variant="body1">{headerTitle}</Typography>}
        secondary={
          <Fragment>
            <br />
            <SchemaTable schema={schema} serviceName="unknown" />
          </Fragment>
        }
      />
    </ListItem>
  );

  renderExpansionDetails = () => {
    const { classes, entry } = this.props;
    const { expanded } = this.state;

    return (
      expanded && (
        <List className={classes.list}>
          {this.renderSchemaTable(entry.content.$id, entry.content.description)}
        </List>
      )
    );
  };

  handlePanelChange = key => () => {
    const { entry, history } = this.props;
    const { expanded } = this.state;

    if (window.location.hash === `#${entry.content[key]}` || expanded) {
      history.push(history.location.pathname);
    } else {
      history.push(`#${entry.content[key]}`);
    }

    this.setState({
      expanded: !expanded,
    });
  };

  render() {
    const { classes } = this.props;
    const { expanded } = this.state;
    const entryHashKey = 'content.$id';

    return (
      <ExpansionPanel
        defaultExpanded={expanded}
        onChange={this.handlePanelChange(entryHashKey)}
        CollapseProps={{ unmountOnExit: true }}>
        <ExpansionPanelSummary
          classes={{
            content: classNames(classes.expansionPanelSummary),
          }}
          expandIcon={<ExpandMoreIcon />}>
          {this.renderExpansionPanelSummary()}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
          {this.renderExpansionDetails()}
        </ExpansionPanelDetails>
      </ExpansionPanel>
    );
  }
}
