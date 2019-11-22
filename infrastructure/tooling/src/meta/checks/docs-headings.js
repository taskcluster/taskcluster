const fs = require('fs');
const _ = require('lodash');
const glob = require('glob');
const {REPO_ROOT} = require('../../utils');

exports.tasks = [];
exports.tasks.push({
  title: 'Docs headings match expectations',
  requires: [],
  provides: [],
  run: async (requirements, utils) => {
    const markdowns = glob.sync(
      'ui/docs/**/*.mdx',
      { cwd: REPO_ROOT });

    let errors = "";
    let countErrors = 0;

    for (let filename of markdowns) {
      const data = fs.readFileSync(filename, 'utf8');
      let md = data.toString();

      //remove the markdown code blocks which may include python # comment
      // which can be confused with # markdown heading, as in, ui/docs/manual/using/s3-uploads.mdx
      md = md.replace(/```[a-z]*[\s\S]*?\```/g, "");
      const hd = [];

      //hd[i] stores the number of headings with level i
      hd[1] = md.match(/^# /gm);
      hd[2] = md.match(/^## /gm);
      hd[3] = md.match(/^### /gm);
      hd[4] = md.match(/^#### /gm);
      hd[5] = md.match(/^##### /gm);
      hd[6] = md.match(/^###### /gm);

      //counting levels of headings present and marking the top level
      let topLevelHd = 7;
      for (let i = 1; i <= 6; i++) {
        if (hd[i] != null && hd[i].length > 0) {
          if (i < topLevelHd){
            topLevelHd = i;
          }
        }
      }

      // check if there is a single top-level heading
      if (topLevelHd < 7) {
        if (hd[topLevelHd].length > 1) {
          countErrors++;
          errors += `${filename} does not have a single top level heading\n`;
          console.log(errors);
        }
      }
    }

    //if there are any errors found
    if(countErrors > 0) {
      throw new Error(errors);
    }
  },
});
