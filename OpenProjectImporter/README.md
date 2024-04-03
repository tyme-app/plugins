# OpenProject Importer

This plugin imports your open and assigned work packages from [OpenProject](https://www.openproject.org). It can also update tasks based on time entries in a given time period, which are not assigned to you or currently open.

The plugin uses the [OpenProject API](https://www.openproject.org/docs/api/) to fetch the data. The OpenProject URL can be specified if a self-hosted version is used.

## Functionality

### Categories and Projects

For each project in OpenProject, a category as well a project is created. If you have child projects in OpenProject, the projects are assigned to the same category.

### Tasks (Work Packages)

A task is created for each work package in OpenProject.

The following data is set or updated:
| Tyme | OpenProject |
| --- | --- |
| Name | Work package subject |
| Completed | Based on "closed" status of work package status |
| Start date | Start date of work package |
| End date | Due date of work package |
| Planned Duration | Estimated time of work package |

### Updating Tasks (Work Packages) from Time Entries

If the option to update tasks is enabled, the time entries in Tyme for the selected range will be selected. The associated tasks are then retrieved and updated individually, even if they have been closed in OpenProject or are no longer assigned to you.

> [!NOTE]
> If you have a high number of different tasks, the import will take much longer. This is because each work package must be retrieved individually to update the tasks.

## License

Distributed under the MIT License. See the LICENSE file for more info.

> [!IMPORTANT]  
> This License only applies to the OpenProjectImporter Plugin.
