const core = require('@actions/core');
const github = require('@actions/github');

function findItems(str, key, delim, seqDelim){
    str = str.toLowerCase();
    if(!str.includes(key)){
        retDict = {};
        retDict.idxs = [];
        retDict.items = [];
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
    const labelSubstring = labelStringAndTokens.string;
    const newTitle = issueTitle.replace(labelSubstring, '');
    const projectTokens = findItems(issueTitle, 'projects', ',', ';').tokens;
    
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
      title: newTitle,
      labels: labelTokens
    });
  
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