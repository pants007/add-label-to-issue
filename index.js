const core = require('@actions/core');
const github = require('@actions/github');

function findItems(str, key, delim, seqDelim){
    str = str.toLowerCase();
    if(!str.includes(key)){
        retDict = {};
        retDict.string = '';
        retDict.tokens = [];
        return retDict;
    }
    retDict = {};
    idx1 = str.search(key);
    start = idx1+key.length;
    if (str.charAt(start) !== ':'){
        throw 'A valid key must be followed by a \':\'!';
    }
    start += 1; //increment to exclude ':' from the substring
    substr = str.substring(start, str.length);
    idx2 = substr.search(seqDelim)+start;
    tokenString = str.substring(start, idx2);
    tokens = tokenString.split(delim);

    retDict = {};
    retDict.string = str.substring(idx1, idx2+1); //+1 to account for ';'
    retDict.tokens = tokens;
    return retDict;
}

async function addLabels(){
    // `who-to-greet` input defined in action metadata file
    const myToken = core.getInput('repo-token');
    const issueTitle = core.getInput('issue-title');
    const issueNumber = core.getInput('issue-number');
    const repoName = github.context.payload.repository.name;
    const ownerName = github.context.payload.repository.owner.login;
    const octokit = github.getOctokit(myToken);
    
    const labelStringAndTokens = findItems(issueTitle, 'labels', ',', ';');
    const labelTokens = labelStringAndTokens.tokens;
    
    // remove the label substring from the issue title, makes it look better
    
    const projectStringAndTokens = findItems(issueTitle, 'projects', ',', ';');
    const projectTokens = projectStringAndTokens.tokens;
    
    const labelSubstring = labelStringAndTokens.string;
    const projectSubstring = projectStringAndTokens.string;
    const issueTitleWithoutLabels = issueTitle.replace(labelSubstring, '');
    const newTitle = issueTitleWithoutLabels.replace(projectSubstring, '');
    
    
    if (labelTokens.length > 0){
      //check if issue has changed since the action started
      var updatedIssue = await octokit.rest.issues.get({
        owner: ownerName,
        repo: repoName,
        issue_number: issueNumber
      });

      let currentLabels = updatedIssue.data.labels.map(label => label.name);
      if(currentLabels.length > 0){
        return "Labels have been added since job started, not doing anything"
      }

      await octokit.rest.issues.update({
        owner: ownerName,
        repo: repoName,
        issue_number: issueNumber,
        title: newTitle.trim(),
        labels: labelTokens
      });
    }
    
    if (projectTokens.length > 0){
      var projectsInfo = await octokit.rest.projects.listForRepo({
        owner: ownerName,
        repo: repoName
      });
      console.log(projectsInfo);
      const projectNamesAndIds = projectsInfo.data.map(project => [project.name, project.id]);
      //only support assigning issue to single project
      const correctProjectNameAndId = projectNamesAndIds.find(item => item[0] === projectTokens[0]);
      if (!(correctProjectNameAndId === undefined)){
        var projectColumns = await octokit.rest.projects.listColumns({project_id:correctProjectNameAndId[1]});
        console.log(projectColumns);
        const columnNamesAndIds = projectColumns.data.map(column => [column.name, column.id]);
        const todoColumn = columnNamesAndIds.find(item => item[0] === 'To do');

        await octokit.rest.projects.createCard({
            column_id:todoColumn[1],
            note:newTitle.trim(),
            content_id:parseInt(issueNumber),
            content_type:'Issue'
          }
        )
      }
    }

    return `Updated labels in ${issueNumber}. Added: ${labelTokens}.`;
}

addLabels().then(
  result => {
    // eslint-disable-next-line no-console
    console.log(result);
  },
  err => {
    // eslint-disable-next-line no-console
    console.log(err);
  }
)
.then(() => {
  process.exit();
});