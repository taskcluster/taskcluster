import { Component } from 'react';
import { Link, withRouter } from 'react-router-dom';
import classNames from 'classnames';
import {
  arrayOf,
  bool,
  instanceOf,
  oneOfType,
  shape,
  string,
} from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import Card, { CardContent } from 'material-ui/Card';
import Collapse from 'material-ui/transitions/Collapse';
import MobileStepper from 'material-ui/MobileStepper';
import List, { ListItem, ListItemText } from 'material-ui/List';
import Table, {
  TableBody,
  TableCell,
  TableFooter,
  TablePagination,
  TableRow,
} from 'material-ui/Table';
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
import DateDistance from '../DateDistance';
import Label from '../Label';
import Spinner from '../Spinner';
import labels from '../../utils/labels';
import { ARTIFACTS_PAGE_SIZE } from '../../utils/constants';

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
  artifactsLoading: {
    textAlign: 'right',
  },
}))
export default class TaskRunsCard extends Component {
  static propTypes = {
    runs: arrayOf(
      shape({
        taskId: string,
        state: string,
        reasonCreated: string,
        scheduled: oneOfType([string, instanceOf(Date)]),
        started: oneOfType([string, instanceOf(Date)]),
        workerGroup: string,
        workerId: string,
        takenUntil: oneOfType([string, instanceOf(Date)]),
        artifacts: shape({
          pageInfo: shape({
            hasNextPage: bool,
            hasPreviousPage: bool,
            cursor: string,
            previousCursor: string,
            nextCursor: string,
          }),
          edges: arrayOf(
            shape({
              name: string,
              contentType: string,
              url: string,
              isPublicLog: bool,
            })
          ),
        }),
      })
    ).isRequired,
    workerType: string.isRequired,
    provisionerId: string.isRequired,
  };

  static getDerivedStateFromProps({ runs }) {
    const currentRunId = runs.length - 1;
    const run = runs[currentRunId];
    const { pageInfo } = run.artifacts;

    if (pageInfo.hasNextPage && pageInfo.hasPreviousPage) {
      return {
        currentRunId,
        count: ARTIFACTS_PAGE_SIZE * 3,
        page: 1,
      };
    } else if (pageInfo.hasNextPage) {
      return {
        currentRunId,
        count: ARTIFACTS_PAGE_SIZE * 2,
        page: 0,
      };
    } else if (pageInfo.hasPreviousPage) {
      return {
        currentRunId,
        count: ARTIFACTS_PAGE_SIZE * 2,
        page: 1,
      };
    }

    return {
      currentRunId,
      count: ARTIFACTS_PAGE_SIZE,
      page: 0,
    };
  }

  state = {
    artifactsLoading: false,
    currentRunId: 0,
    count: 0,
    page: 0,
    showArtifacts: false,
  };

  handleToggleArtifacts = () => {
    this.setState({ showArtifacts: !this.state.showArtifacts });
  };

  handleNext = () => {
    this.setState({ currentRunId: this.state.currentRunId + 1 });
  };

  handlePrevious = () => {
    this.setState({ currentRunId: this.state.currentRunId - 1 });
  };

  handlePageChange = (e, nextPage) => {
    const { runs, onArtifactsPageChange } = this.props;
    const { page, currentRunId } = this.state;
    const { pageInfo } = runs[currentRunId].artifacts;

    this.setState({ artifactsLoading: true }, async () => {
      await onArtifactsPageChange({
        cursor: nextPage > page ? pageInfo.nextCursor : pageInfo.previousCursor,
        previousCursor: pageInfo.cursor,
        runId: currentRunId,
      });
      this.setState({ artifactsLoading: false });
    });
  };

  handleArtifactClick = (e, artifact) => {
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

  renderArtifactIcon(artifact) {
    if (artifact.isPublicLog) {
      return <LockOpenOutlineIcon />;
    } else if (artifact.url) {
      return <LockIcon />;
    }

    return null;
  }

  renderArtifactLinkIcon(artifact) {
    if (artifact.isPublicLog) {
      return <LinkIcon size={16} />;
    } else if (artifact.url) {
      return <OpenInNewIcon size={16} />;
    }

    return null;
  }

  render() {
    const { classes, runs, provisionerId, workerType } = this.props;
    const {
      currentRunId,
      showArtifacts,
      count,
      page,
      artifactsLoading,
    } = this.state;
    const run = runs[currentRunId];
    const artifacts = run.artifacts.edges;

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
                  secondary={
                    <Label mini status={labels[run.state]}>
                      {run.state}
                    </Label>
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Reason Created"
                  secondary={
                    <Label mini status={labels[run.reasonCreated]}>
                      {run.reasonCreated}
                    </Label>
                  }
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
                      <Label mini status={labels[run.reasonResolved]}>
                        {run.reasonResolved}
                      </Label>
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
                    <Table>
                      <TableBody>
                        {artifacts.length !== 0 ? (
                          artifacts.map(({ node: artifact }) => (
                            <TableRow
                              key={`run-artifact-${run.taskId}-${run.runId}-${
                                artifact.name
                              }`}
                              className={classNames(classes.listItemButton, {
                                [classes.pointer]: !!artifact.url,
                              })}
                              onClick={
                                artifact.url
                                  ? e => this.handleArtifactClick(e, artifact)
                                  : null
                              }
                              hover={!!artifact.url}>
                              <TableCell>
                                {this.renderArtifactIcon(artifact)}
                              </TableCell>
                              <TableCell>{artifact.name}</TableCell>
                              <TableCell className={classes.linkCell}>
                                {this.renderArtifactLinkIcon(artifact)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3}>
                              <em>No artifacts for this page.</em>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          {artifactsLoading ? (
                            <TableCell
                              colSpan={3}
                              className={classes.artifactsLoading}>
                              <Spinner size={24} />
                            </TableCell>
                          ) : (
                            <TablePagination
                              colSpan={3}
                              count={count}
                              labelDisplayedRows={Function.prototype}
                              rowsPerPage={ARTIFACTS_PAGE_SIZE}
                              rowsPerPageOptions={[ARTIFACTS_PAGE_SIZE]}
                              page={page}
                              onChangePage={this.handlePageChange}
                            />
                          )}
                        </TableRow>
                      </TableFooter>
                    </Table>
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
