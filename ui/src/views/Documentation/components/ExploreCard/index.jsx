import React from 'react';
import { element, string } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Card from '@material-ui/core/Card';
import Typography from '@material-ui/core/Typography';
import CardContent from '@material-ui/core/CardContent';
import CardActionArea from '@material-ui/core/CardActionArea';
import Anchor from '../Anchor';

const styles = theme => ({
  root: {
    position: 'relative',
    height: theme.spacing(25),
  },
  cardActionArea: {
    height: '100%',
  },
  titleCardContent: {
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    marginLeft: theme.spacing(1),
  },
});

function ExploreCard({ classes, to, title, description, icon, ...props }) {
  return (
    <Anchor href={to}>
      <Card classes={{ root: classes.root }} {...props}>
        <CardActionArea className={classes.cardActionArea}>
          <CardContent className={classes.titleCardContent}>
            {icon}
            <Typography variant="h6" className={classes.title}>
              {title}
            </Typography>
          </CardContent>
          <CardContent>
            <Typography variant="body2">{description}</Typography>
          </CardContent>
        </CardActionArea>
      </Card>
    </Anchor>
  );
}

ExploreCard.propTypes = {
  /** The title of the card. */
  title: string.isRequired,
  /** A short description of the card. */
  description: string.isRequired,
  /** An icon to use beside the title. */
  icon: element.isRequired,
  /** A path to follow when the action button is clicked. */
  to: string.isRequired,
};

export default withStyles(styles)(ExploreCard);
