# Jira Importer

This plugin imports your open and assigned issues from Jira.

The plugin uses the [Jira Rest API](https://developer.atlassian.com/cloud/jira/platform/rest/v3) to fetch the data. The Jira URL can be specified.

## Functionality

### Categories and Projects

For each project in Jira a Tyme project is created. Categories will not be created, but can be set manually.

### Tasks (Issues)

A task is created for each issues in Jira.

The following data is set or updated:
| Tyme | Jira |
| --- | --- |
| Name | Issue summary |
| Start date | Select between Jira date fields. |
| End date | Select between Jira date fields. |
| Planned Duration | Select between Jira number fields. |

## License

Distributed under the MIT License. See the LICENSE file for more info.

> [!IMPORTANT]  
> This License only applies to the JiraImporter Plugin.
