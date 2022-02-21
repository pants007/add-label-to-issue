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

async function main_graphql(){
  let issueTitle = core.getInput('issue-title');
  const issueId = core.getInput('issue-number');
  const columnName = core.getInput('column-name');
  const parseLabels = core.getBooleanInput('parse-labels');
  const parseProject = core.getBooleanInput('parse-project');
  const autoParseProject = core.getBooleanInput('auto-parse-project');
  const parseAssignees = core.getBooleanInput('parse-assignees');
  const repoName = github.context.payload.repository.name;
  const ownerName = github.context.payload.repository.owner.login;
  const myToken = core.getInput('repo-token');
  const octokit = github.getOctokit(myToken);

  const query = `
  {
    repository(owner: "${ownerName}", name: "${repoName}"){
      projects(first:10){
        nodes{
          name
          columns(first:10){
            nodes{
              name
              id
            }
          }
        }
      }
      labels(first:100){
        nodes{
          name
          id
        }
      }
      assignableUsers(first:100){
        nodes{
          login
          id
        }
      }
    }
  }
  `;
  var response = await octokit.graphql(query);

  try{
    const projects = response.repository.projects.nodes;
    const labels = response.repository.labels.nodes
    const assignees = response.repository.assignableUsers.nodes;
    let validLabels = [];
    let validAssignees = [];
    let projectName = "";
    let columnId = "";

    if (parseLabels) {
      const labelData = getItems(issueTitle, 'labels', ',', ';');
      issueTitle = issueTitle.replace(labelData.string, '');
      validLabels = labels.filter(label => labelData.tokens.includes(label.name));
    } 
    if (parseAssignees) {
      const assigneeData = getItems(issueTitle, '@', ',', ';');
      issueTitle = issueTitle.replace(assigneeData.string, '');
      validAssignees = assignees.filter(a => assigneeData.tokens.includes(a.name));
    }
    if (parseProject) {
      const projectData = getItems(issueTitle, 'project', ',', ';');
      issueTitle = issueTitle.replace(projectData.string, '');
      const project = projects.find(proj => proj.name == projectData.tokens[0]);
      const column = project.columns.nodes.find(col => col.name == columnName);
      projectName = project.name;
      columnId = column.id;
    } 
    else if (autoParseProject) {
      const projectNames = core.getInput('auto-parse-project-names').split(',').map(t => t.trim());
      const issueBody = github.event.issue.body;
      const urlPrefix = `https://github.com/${ownerName}/${repoName}/blob/`;
      const commitHashLength = 41; // don't want to compute or find commit hash, assume length of hash is always 40 characters
      const projectName = projectNames.find(n => {
        let url = issueBody.substring(issueBody.search(urlPrefix), issueBody.length);
        let len = urlPrefix.length + commitHashLength;
        let firstFolder = url.substring(len, len+n.length);
        return firstFolder == n;
      });
      //maybe check if projectName is undefined
      const project = projects.find(proj => proj.name == projectName);
      const column = project.columns.nodes.find(col => col.name == columnName);
      projectName = project.name;
      columnId = column.id;
    }

    const mutation = `
    mutation {
      addAssigneesToAssignable(input:{assignableId:"${issueId}", assigneeIds:${JSON.stringify(validAssignees)}}){
        clientMutationId
      }
      addLabelsToLabelable(input:{labelableId:"${issueId}", labelIds:${JSON.stringify(validLabels)}}){
        clientMutationId
      }
      addProjectCard(input:{contentId:"${issueId}", projectColumnId:"${columnId}"}){
        clientMutationId
      }
    }
    `
    var mutationResponse = await octokit.graphql(mutation);
    console.log(JSON.stringify(mutationResponse, undefined, 2));
    core.setOutput('project-name', `${repoName}/projects/${project.name}`);
    core.setOutput('labels-added', JSON.stringify(validLabels));
    return `Added the labels ${JSON.stringify(validLabels)} to issue #${IssueId}\n
    Added assignees ${JSON.stringify(validAssignees)} to issue #${IssueId}\n
  The issue was added to ${repoName}/projects/${project.name} in column \'${columnName}\'`;
  } catch (err) {
    console.log(err);
  }
}

main_graphql().then(
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