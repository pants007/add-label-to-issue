# add-label-to-issue-action
This action will parse the title of an issue for labels, assignees, and a project name. If a token is found for one of these categories, a corresponding change will occur to the issue.
## Usage
### Add labels to an issue
To add labels to an issue, the title must contain a substring `labels:label_1,label_2,...,label_n;`
### Add assignees to an issue
To add assignees to an issue, the title must contain a substring `@:user_1,user_2,...,user_n;`
### Add an issue to a project
To add an issue to a project, the title must contain a substring `project:project_name;`

## Inputs
| Name         | Default                          | Description                                    |
|--------------|----------------------------------|------------------------------------------------|
| issue-number | ${{github.event.issue.node_id}}  | The id of the issue that will be processed by the action |
| issue-title  | ${{github.event.issue.title}}    | The string the action will parse for token categories and tokens|
| column-name  | "To do"                          | The project column the created project card will be added to|
| parse-labels | true                             | Parse title for labels|
| parse-project| true                             | Parse title for project name|
| parse-assignees| true                           | Parse title for assignees|
| auto-parse-project| false                       | Deduce project from the path to the file referenced in the issue|
| auto-parse-project-tokens| "code, report" | Comma-separated tokens used for automatic project parsing |
| repo-token   | ${{github.token}}                | The authentication token used by the action    |