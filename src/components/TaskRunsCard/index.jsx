import React, { Component, Fragment } from 'react';
import { Link, withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { func, number, string } from 'prop-types';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import Label from '@mozilla-frontend-infra/components/Label';
import { withStyles } from '@material-ui/core/styles';
import { fade } from '@material-ui/core/styles/colorManipulator';
import Typography from '@material-ui/core/Typography';
import Card from '@material-ui/core/Card';
import CardContent from '@material-ui/core/CardContent';
import Collapse from '@material-ui/core/Collapse';
import MobileStepper from '@material-ui/core/MobileStepper';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import ChevronLeftIcon from 'mdi-react/ChevronLeftIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import LockIcon from 'mdi-react/LockIcon';
import LockOpenOutlineIcon from 'mdi-react/LockOpenOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Button from '../Button';
import ConnectionDataTable from '../ConnectionDataTable';
import DateDistance from '../DateDistance';
import StatusLabel from '../StatusLabel';
import NoRunsIcon from './NoRunsIcon';
import { ARTIFACTS_PAGE_SIZE } from '../../utils/constants';
import { runs } from '../../utils/prop-types';

const DOTS_VARIANT_LIMIT = 5;

@withRouter
@withStyles(
  theme => ({
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
      ...theme.mixins.listItemButton,
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
    artifactsListItemContainer: {
      display: 'block',
    },
    boxVariantIcon: {
      width: '25%',
      height: 'auto',
    },
    boxVariant: {
      textAlign: 'center',
    },
    boxVariantText: {
      color: fade(theme.palette.text.primary, 0.4),
    },
  }),
  { withTheme: true }
)
/**
 * Render a paginated card layout for the runs of a GraphQL task response.
 */
export default class TaskRunsCard extends Component {
  static propTypes = {
    /**
     * A collection of runs for a GraphQL task.
     */
    runs: runs.isRequired,
    /**
     * The worker type associated with the runs' task.
     */
    workerType: string.isRequired,
    /**
     * The provisioner ID associated with the runs' task.
     */
    provisionerId: string.isRequired,
    /**
     * The current selected run index to display in the card. Paging through
     * runs will trigger a history change, for which the `selectedRunId` can be
     * updated.
     */
    selectedRunId: number.isRequired,
    /**
     * Execute a function to load new artifacts when paging through them.
     */
    onArtifactsPageChange: func.isRequired,
  };

  state = {
    showArtifacts: false,
  };

  getCurrentRun() {
    return this.props.runs[this.props.selectedRunId];
  }

  handleArtifactClick = ({ url, isPublicLog }) => {
    if (!url) {
      return null;
    }

    return () => {
      const { history } = this.props;
      const { taskId, runId, state } = this.getCurrentRun();

      if (isPublicLog) {
        const live = state === 'PENDING' || state === 'RUNNING';
        const encoded = encodeURIComponent(url);
        const path = live
          ? `/tasks/${taskId}/runs/${runId}/logs/live/${encoded}`
          : `/tasks/${taskId}/runs/${runId}/logs/${encoded}`;

        history.push(path);
      } else {
        Object.assign(window.open(), {
          opener: null,
          location: url,
        });
      }
    };
  };

  handleNext = () => {
    const { history } = this.props;
    const { taskId, runId } = this.getCurrentRun();

    history.push(`/tasks/${taskId}/runs/${runId + 1}`);
  };

  handlePrevious = () => {
    const { history } = this.props;
    const { taskId, runId } = this.getCurrentRun();

    history.push(`/tasks/${taskId}/runs/${runId - 1}`);
  };

  handleToggleArtifacts = () => {
    this.setState({ showArtifacts: !this.state.showArtifacts });
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

  renderArtifactsTable() {
    const { classes, onArtifactsPageChange } = this.props;
    const run = this.getCurrentRun();
    const artifacts = this.createSortedArtifactsConnection(run.artifacts);

    return (
      <ConnectionDataTable
        connection={artifacts}
        pageSize={ARTIFACTS_PAGE_SIZE}
        columnsSize={3}
        onPageChange={onArtifactsPageChange}
        renderRow={({ node: artifact }) => (
          <TableRow
            key={`run-artifact-${run.taskId}-${run.runId}-${artifact.name}`}
            className={classNames(classes.listItemButton, {
              [classes.pointer]: !!artifact.url,
            })}
            onClick={this.handleArtifactClick(artifact)}
            hover={!!artifact.url}
          >
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
    const {
      classes,
      runs,
      selectedRunId,
      provisionerId,
      workerType,
      theme,
    } = this.props;
    const { showArtifacts } = this.state;
    const run = this.getCurrentRun();

    return (
      <Card raised>
        <div>
          <CardContent classes={{ root: classes.cardContent }}>
            <Typography variant="h5" className={classes.headline}>
              Task Runs
            </Typography>
            {run ? (
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
                <CopyToClipboard title={run.scheduled} text={run.scheduled}>
                  <ListItem button className={classes.listItemButton}>
                    <ListItemText
                      primary="Scheduled"
                      secondary={<DateDistance from={run.scheduled} />}
                    />
                    <ContentCopyIcon />
                  </ListItem>
                </CopyToClipboard>
                <CopyToClipboard title={run.started} text={run.started}>
                  <ListItem button className={classes.listItemButton}>
                    <ListItemText
                      primary="Started"
                      secondary={
                        run.started ? (
                          <DateDistance
                            from={run.started}
                            offset={run.scheduled}
                          />
                        ) : (
                          <em>n/a</em>
                        )
                      }
                    />
                    <ContentCopyIcon />
                  </ListItem>
                </CopyToClipboard>
                <CopyToClipboard title={run.resolved} text={run.resolved}>
                  <ListItem button className={classes.listItemButton}>
                    <ListItemText
                      primary="Resolved"
                      secondary={
                        run.resolved ? (
                          <DateDistance
                            from={run.resolved}
                            offset={run.started}
                          />
                        ) : (
                          <em>n/a</em>
                        )
                      }
                    />
                    <ContentCopyIcon />
                  </ListItem>
                </CopyToClipboard>
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
                  to={`/provisioners/${provisionerId}/worker-types/${workerType}/workers/${
                    run.workerId
                  }`}
                >
                  <ListItemText primary="Worker ID" secondary={run.workerId} />
                  <LinkIcon />
                </ListItem>
                <CopyToClipboard title={run.takenUntil} text={run.takenUntil}>
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
                </CopyToClipboard>
                <ListItem
                  button
                  className={classes.listItemButton}
                  onClick={this.handleToggleArtifacts}
                >
                  <ListItemText primary="Artifacts" />
                  {showArtifacts ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </ListItem>
                <Collapse in={showArtifacts} timeout="auto">
                  <List component="div" disablePadding>
                    <ListItem
                      className={classes.artifactsListItemContainer}
                      component="div"
                      disableGutters
                    >
                      {this.renderArtifactsTable()}
                    </ListItem>
                  </List>
                </Collapse>
              </List>
            ) : (
              <div className={classes.boxVariant}>
                <NoRunsIcon
                  fill={theme.palette.text.primary}
                  className={classes.boxVariantIcon}
                />
                <Typography className={classes.boxVariantText} variant="h6">
                  No Runs
                </Typography>
                <Typography className={classes.boxVariantText}>
                  A run will be created when the task gets schedueled.
                </Typography>
              </div>
            )}
          </CardContent>
          <MobileStepper
            variant={runs.length > DOTS_VARIANT_LIMIT ? 'progress' : 'dots'}
            position="static"
            steps={runs.length}
            activeStep={selectedRunId}
            className={classes.root}
            nextButton={
              <Button
                size="small"
                onClick={this.handleNext}
                disabled={selectedRunId === runs.length - 1}
              >
                Next
                <ChevronRightIcon />
              </Button>
            }
            backButton={
              <Button
                size="small"
                onClick={this.handlePrevious}
                disabled={selectedRunId === 0}
              >
                <ChevronLeftIcon />
                Previous
              </Button>
            }
          />
        </div>
      </Card>
    );
  }
}
