import { Component, Fragment } from 'react';
import { Link, withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { string } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import Card, { CardContent } from 'material-ui/Card';
import Collapse from 'material-ui/transitions/Collapse';
import MobileStepper from 'material-ui/MobileStepper';
import List, { ListItem, ListItemText } from 'material-ui/List';
import { TableCell, TableRow } from 'material-ui/Table';
import Typography from 'material-ui/Typography';
import ChevronLeftIcon from 'mdi-react/ChevronLeftIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import LockIcon from 'mdi-react/LockIcon';
import LockOpenOutlineIcon from 'mdi-react/LockOpenOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import ConnectionDataTable from '../ConnectionDataTable';
import DateDistance from '../DateDistance';
import Label from '../Label';
import StatusLabel from '../StatusLabel';
import { ARTIFACTS_PAGE_SIZE } from '../../utils/constants';
import { runs } from '../../utils/prop-types';

const DOTS_VARIANT_LIMIT = 5;

@withRouter
@withStyles(theme => ({
  headline: {
    paddingLeft: theme.spacing.triple,
    paddingRight: theme.spacing.triple,
  },
  cardContent: {
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: theme.spacing.double,
    paddingBottom: theme.spacing.double,
    '&:last-child': {
      paddingBottom: theme.spacing.triple,
    },
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    paddingLeft: theme.spacing.unit,
    paddingBottom: theme.spacing.unit,
  },
  listItemButton: {
    '& svg': {
      transition: theme.transitions.create('fill'),
      fill: theme.palette.primary.light,
    },
    '&:hover svg': {
      fill: theme.palette.common.white,
    },
  },
  pre: {
    margin: 0,
    fontSize: theme.typography.body2.fontSize,
  },
  pointer: {
    cursor: 'pointer',
  },
  linkCell: {
    textAlign: 'right',
  },
  logButton: {
    marginRight: theme.spacing.unit,
  },
}))
export default class TaskRunsCard extends Component {
  static propTypes = {
    runs: runs.isRequired,
    workerType: string.isRequired,
    provisionerId: string.isRequired,
  };

  static getDerivedStateFromProps({ runs }) {
    return {
      currentRunId: runs.length - 1,
    };
  }

  state = {
    currentRunId: 0,
    showArtifacts: false,
  };

  createSortedArtifactsConnection(artifacts) {
    return {
      ...artifacts,
      edges: [...artifacts.edges].sort((a, b) => {
        if (a.node.isPublicLog === b.node.isPublicLog) {
          return 0;
        }

        return a.node.isPublicLog ? -1 : 1;
      }),
    };
  }

  handleToggleArtifacts = () => {
    this.setState({ showArtifacts: !this.state.showArtifacts });
  };

  handleNext = () => {
    this.setState({ currentRunId: this.state.currentRunId + 1 });
  };

  handlePrevious = () => {
    this.setState({ currentRunId: this.state.currentRunId - 1 });
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const { onArtifactsPageChange } = this.props;
    const { currentRunId } = this.state;

    return onArtifactsPageChange({
      cursor,
      previousCursor,
      runId: currentRunId,
    });
  };

  handleArtifactClick = artifact => {
    if (!artifact.url) {
      return null;
    }

    return () => {
      const { runs, history } = this.props;
      const { currentRunId } = this.state;
      const run = runs[currentRunId];

      if (artifact.isPublicLog) {
        history.push(
          `/tasks/${run.taskId}/runs/${currentRunId}/${encodeURIComponent(
            artifact.url
          )}`
        );
      } else {
        const tab = window.open();

        tab.opener = null;
        tab.location = artifact.url;
      }
    };
  };

  renderArtifactsTable() {
    const { classes, runs } = this.props;
    const { currentRunId } = this.state;
    const run = runs[currentRunId];
    const artifacts = this.createSortedArtifactsConnection(run.artifacts);

    return (
      <ConnectionDataTable
        connection={artifacts}
        pageSize={ARTIFACTS_PAGE_SIZE}
        columnsSize={3}
        onPageChange={this.handlePageChange}
        renderRow={({ node: artifact }) => (
          <TableRow
            key={`run-artifact-${run.taskId}-${run.runId}-${artifact.name}`}
            className={classNames(classes.listItemButton, {
              [classes.pointer]: !!artifact.url,
            })}
            onClick={this.handleArtifactClick(artifact)}
            hover={!!artifact.url}>
            <TableCell>
              {artifact.isPublicLog && <LockOpenOutlineIcon />}
              {!artifact.isPublicLog && artifact.url && <LockIcon />}
            </TableCell>
            <TableCell>
              <Fragment>
                {artifact.isPublicLog && (
                  <Label status="info" mini className={classes.logButton}>
                    LOG
                  </Label>
                )}
                {artifact.name}
              </Fragment>
            </TableCell>
            <TableCell className={classes.linkCell}>
              {artifact.isPublicLog && <LinkIcon size={16} />}
              {!artifact.isPublicLog &&
                artifact.url && <OpenInNewIcon size={16} />}
            </TableCell>
          </TableRow>
        )}
      />
    );
  }

  render() {
    const { classes, runs, provisionerId, workerType } = this.props;
    const { currentRunId, showArtifacts } = this.state;
    const run = runs[currentRunId];

    return (
      <Card raised>
        <div>
          <CardContent classes={{ root: classes.cardContent }}>
            <Typography variant="headline" className={classes.headline}>
              Task Runs
            </Typography>
            <List>
              <ListItem>
                <ListItemText
                  primary="State"
                  secondary={<StatusLabel state={run.state} />}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Reason Created"
                  secondary={<StatusLabel state={run.reasonCreated} />}
                />
              </ListItem>
              <ListItem button className={classes.listItemButton}>
                <ListItemText
                  primary="Scheduled"
                  secondary={<DateDistance from={run.scheduled} />}
                />
                <ContentCopyIcon />
              </ListItem>
              <ListItem button className={classes.listItemButton}>
                <ListItemText
                  primary="Started"
                  secondary={
                    run.started ? (
                      <DateDistance from={run.started} offset={run.scheduled} />
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
                <ContentCopyIcon />
              </ListItem>
              <ListItem button className={classes.listItemButton}>
                <ListItemText
                  primary="Resolved"
                  secondary={
                    run.resolved ? (
                      <DateDistance from={run.resolved} offset={run.started} />
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
                <ContentCopyIcon />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Reason Resolved"
                  secondary={
                    run.reasonResolved ? (
                      <StatusLabel state={run.reasonResolved} />
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Worker Group"
                  secondary={run.workerGroup || <em>n/a</em>}
                />
              </ListItem>
              <ListItem
                button
                className={classes.listItemButton}
                component={Link}
                to={`/provisioners/${provisionerId}/worker-types/${workerType}`}>
                <ListItemText primary="Worker Type" secondary={workerType} />
                <LinkIcon />
              </ListItem>
              <ListItem button className={classes.listItemButton}>
                <ListItemText
                  primary="Taken Until"
                  secondary={
                    run.takenUntil ? (
                      <DateDistance from={run.takenUntil} />
                    ) : (
                      <em>n/a</em>
                    )
                  }
                />
                <ContentCopyIcon />
              </ListItem>
              <ListItem
                button
                className={classes.listItemButton}
                onClick={this.handleToggleArtifacts}>
                <ListItemText primary="Artifacts" />
                {showArtifacts ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </ListItem>
              <Collapse in={showArtifacts} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  <ListItem component="div" disableGutters>
                    {this.renderArtifactsTable()}
                  </ListItem>
                </List>
              </Collapse>
            </List>
          </CardContent>
          {runs.length > 1 && (
            <MobileStepper
              variant={runs.length > DOTS_VARIANT_LIMIT ? 'progress' : 'dots'}
              position="static"
              steps={runs.length}
              activeStep={currentRunId}
              className={classes.root}
              nextButton={
                <Button
                  size="small"
                  onClick={this.handleNext}
                  disabled={currentRunId === runs.length - 1}>
                  Next
                  <ChevronRightIcon />
                </Button>
              }
              backButton={
                <Button
                  size="small"
                  onClick={this.handlePrevious}
                  disabled={currentRunId === 0}>
                  <ChevronLeftIcon />
                  Previous
                </Button>
              }
            />
          )}
        </div>
      </Card>
    );
  }
}
