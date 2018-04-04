import { Component } from 'react';
import { Link } from 'react-router-dom';
import { arrayOf, instanceOf, oneOfType, shape, string } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import Card, { CardContent } from 'material-ui/Card';
import MobileStepper from 'material-ui/MobileStepper';
import List, { ListItem, ListItemText } from 'material-ui/List';
import Typography from 'material-ui/Typography';
import ChevronLeftIcon from 'mdi-react/ChevronLeftIcon';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import DateDistance from '../DateDistance';
import Label from '../Label';
import { labels } from '../../utils';

const DOTS_VARIANT_LIMIT = 5;

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
}))
export default class TaskRunsCard extends Component {
  static propTypes = {
    runs: arrayOf(
      shape({
        state: string,
        reasonCreated: string,
        scheduled: oneOfType([string, instanceOf(Date)]),
        started: oneOfType([string, instanceOf(Date)]),
        workerGroup: string,
        workerId: string,
        takenUntil: oneOfType([string, instanceOf(Date)]),
      })
    ).isRequired,
    workerType: string.isRequired,
    provisionerId: string.isRequired,
  };

  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.runs.length - 1 > prevState.currentRun) {
      return {
        currentRun: nextProps.runs.length - 1,
      };
    }

    return null;
  }

  state = {
    currentRun: 0,
  };

  handleNext = () => {
    this.setState({ currentRun: this.state.currentRun + 1 });
  };

  handlePrevious = () => {
    this.setState({ currentRun: this.state.currentRun - 1 });
  };

  render() {
    const { classes, runs, provisionerId, workerType } = this.props;
    const { currentRun } = this.state;
    const run = runs[currentRun];

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
            </List>
          </CardContent>
          <MobileStepper
            variant={runs.length > DOTS_VARIANT_LIMIT ? 'progress' : 'dots'}
            position="static"
            steps={runs.length}
            activeStep={currentRun}
            className={classes.root}
            nextButton={
              <Button
                size="small"
                onClick={this.handleNext}
                disabled={currentRun === runs.length - 1}>
                Next
                <ChevronRightIcon />
              </Button>
            }
            backButton={
              <Button
                size="small"
                onClick={this.handlePrevious}
                disabled={currentRun === 0}>
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
