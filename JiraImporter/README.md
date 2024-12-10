# Jira Importer

This plugin imports your open and assigned issues from Jira. It can also update tasks based on time entries in a given time period, which are not assigned to you or currently open in Jira.

The plugin uses the [Jira Rest API](https://developer.atlassian.com/cloud/jira/platform/rest/v3) to fetch the data. The Jira URL can be specified.

## Functionality

### Categories and Projects

For each project in Jira a Tyme project is created. Categories will not be created, but can be set manually.

### Tasks (Issues)

A task is created for each issue in Jira.

The following data is set or updated:
| Tyme | Jira |
| --- | --- |
| Name | Issue summary |
| Start date | Select between Jira date fields. |
| End date | Select between Jira date fields. |
| Planned Duration | Select between Jira number fields. |

### Excluded Projects

Certain projects can be excluded from import by using the excluded projects option. A comma-separated list of project keys can be specified. Issues of these projects are not imported.

### Updating Tasks (Issues) from Time Entries

If the option to update tasks is enabled, the time entries in Tyme for the selected range will be selected. The associated tasks of these time entries are then retrieved and updated individually, even if they have been closed in Jira or are no longer assigned to you. All status with the status category "Done" are considered closed.

## License

Distributed under the MIT License. See the LICENSE file for more info.

> [!IMPORTANT]  
> This License only applies to the JiraImporter Plugin.
