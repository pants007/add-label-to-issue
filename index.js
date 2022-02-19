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
    retDict.tokens = tokens.map(token => token.trim());
    return retDict;
}

async function main(){
    const myToken = core.getInput('repo-token');
    const issueTitle = core.getInput('issue-title');
    const issueNumber = core.getInput('issue-number');
    const columnName = core.getInput('column-name');
    const repoName = github.context.payload.repository.name;
    const repoId = github.context.payload.repository.id;
    const ownerName = github.context.payload.repository.owner.login;
    const octokit = github.getOctokit(myToken);
    
    const labelStringAndTokens = findItems(issueTitle, 'labels', ',', ';');
    const labelTokens = labelStringAndTokens.tokens;
    
    // remove the label substring from the issue title, makes it look better
    const projectStringAndTokens = findItems(issueTitle, 'project', ',', ';');
    const projectTokens = projectStringAndTokens.tokens;
    const labelSubstring = labelStringAndTokens.string;
    const projectSubstring = projectStringAndTokens.string;
    const issueTitleWithoutLabels = issueTitle.replace(labelSubstring, '');
    const newTitle = issueTitleWithoutLabels.replace(projectSubstring, '');

    var repoLabels = await octokit.rest.search.labels({
      repository_id: repoId,
      q:`${labelTokens.join('+')}&repository_id=${repoId}`
    })

    //Check if the extracted tokens are valid labels in the repo
    //Only add the valid labels, as we otherwise end up
    //creating new labels unintentionally
    labelsToAdd = [];
    for(let repoLabel of repoLabels.data.items){
      if (labelTokens.includes(repoLabel.name)){
        labelsToAdd.push(repoLabel.name);
      }
    }
    //check if issue has changed since the action started
    var updatedIssue = await octokit.rest.issues.get({
      owner: ownerName,
      repo: repoName,
      issue_number: issueNumber
    });

    const updatedIssueLabels = updatedIssue.data.labels.map(label => label.name);
    await octokit.rest.issues.update({
      owner: ownerName,
      repo: repoName,
      issue_number: issueNumber,
      title: newTitle.trim(),
      labels: updatedIssueLabels.concat(labelsToAdd)
    });
    core.setOutput('labels-added', labelsToAdd);

    var projectsInfo = await octokit.rest.projects.listForRepo({
      owner: ownerName,
      repo: repoName
    });

    //only support assigning issue to single project
    const project = projectsInfo.data.find(project => project.name === projectTokens[0]);

    if (project === undefined){
      core.setOutput('project-name', 'None');
      throw `Project \'${projectTokens[0]}\' does not exist in ${ownerName}/${repoName}.`
    }
    var projectColumns = await octokit.rest.projects.listColumns({project_id:project.id});
    const column = projectColumns.data.find(column => column.name === columnName);

    await octokit.rest.projects.createCard({
        column_id:column.id,
        content_id:updatedIssue.data.id,
        content_type:'Issue'
      }
    );

    core.setOutput('project-name', `${repoName}/projects/${project.name}`);
    return `Added the labels \'${labelsToAdd}\' to issue #${issueNumber}\n
    The issue was added to ${repoName}/projects/${project.name} in column \'${columnName}\'`;
}

async function AddLabelsAutomaticProjectAssignment(){
  const myToken = core.getInput('repo-token');
  const issueTitle = core.getInput('issue-title');
  const issueNumber = core.getInput('issue-number');
  const columnName = core.getInput('column-name');
  const repoName = github.context.payload.repository.name;
  const ownerName = github.context.payload.repository.owner.login;
  const octokit = github.getOctokit(myToken);
  
  const labelStringAndTokens = findItems(issueTitle, 'labels', ',', ';');
  const labelTokens = labelStringAndTokens.tokens;
  
  // remove the label substring from the issue title, makes it look better
  const labelSubstring = labelStringAndTokens.string;
  const newTitle = issueTitle.replace(labelSubstring, '');

  //Check if the extracted tokens are valid labels in the repo
  //Only add the valid labels, as we otherwise end up
  //creating new labels unintentionally
  var repoLabels = await octokit.rest.issues.listLabelsForRepo({
    owner:ownerName,
    repo:repoName,
  });
  let labelsToAdd = [];
  for(let repoLabel of repoLabels.data){
    if (labelTokens.includes(repoLabel.name)){
      labelsToAdd.push(repoLabel.name);
    }
  }

  //check if issue has changed since the action started
  var updatedIssue = await octokit.rest.issues.get({
    owner: ownerName,
    repo: repoName,
    issue_number: issueNumber
  });

  const potentialNewLabels = updatedIssue.data.labels.map(label => label.name);

  await octokit.rest.issues.update({
    owner: ownerName,
    repo: repoName,
    issue_number: issueNumber,
    title: newTitle.trim(),
    labels: potentialNewLabels.concat(labelsToAdd)
  });
  core.setOutput('labels-added', labelsToAdd);

  let issueBody = updatedIssue.data.body;
  let bodyUrl = issueBody.substring(issueBody.search('https'), issueBody.length)
  let projectName = '';
  if (bodyUrl.includes('code')){
    projectName = 'code'; //assume project is named code
  }else if (bodyUrl.includes('report')){
    projectName = 'report'
  }
  var projectsInfo = await octokit.rest.projects.listForRepo({
    owner: ownerName,
    repo: repoName
  });

  var cardQuery = await octokit.graphql(`
  {
    query GetProjectCard{
      repository(owner:"${ownerName}", name:"${repoName}"){
        projects(first: 5){
          nodes{
            columns(first: 3){
              nodes{
                name
                id
                purpose
                cards{
                  nodes{
                    id
                    note
                    state
                    content{
                      ... on Issue{
                        title
                        number
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }`);

  console.log(cardQuery.data);
  //only support assigning issue to single project
  const project = projectsInfo.data.find(project => project.name === projectName);

  if (project === undefined){
    core.setOutput('project-name', 'None');
    throw `Project \'${projectName}\' does not exist in ${ownerName}/${repoName}.`
  }
  var projectColumns = await octokit.rest.projects.listColumns({project_id:project.id});
  const column = projectColumns.data.find(column => column.name === columnName);

  await octokit.rest.projects.createCard({
      column_id:column.id,
      content_id:updatedIssue.data.id,
      content_type:'Issue'
    }
  );

  core.setOutput('project-name', `${repoName}/projects/${project.name}`);
  return `Added the labels \'${labelsToAdd}\' to issue #${issueNumber}\n
  The issue was added to ${repoName}/projects/${project.name} in column \'${columnName}\'`;
}

AddLabelsAutomaticProjectAssignment().then(
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