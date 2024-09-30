/**
 * Jira project.
 */
class JiraProject {
  /**
   * Create a Jira project.
   * @param {number} id The ID of the project.
   * @param {string} key Key of the project.
   * @param {string} name Name of the project.
   */
  constructor(id, key, name) {
    this.id = id;
    this.key = key;
    this.name = name;
  }

  /**
   * Tyme project id of the project.
   * @returns {string}
   */
  get projectId() {
    return 'jira-' + this.id;
  }

  /**
   * Create or update an existing Tyme project with the data from the Jira project.
   */
  createOrUpdateTymeProject() {
    const tymeProject = Project.fromID(this.projectId) ?? Project.create(this.projectId);
    tymeProject.name = this.name;
  }
}

/**
 * Jira issue.
 */
class JiraIssue {
  /**
   * Create a Jira issue.
   * @param {number} id Jira issue id.
   * @param {string} key Jira issue key.
   * @param {string} summary Jira issue summary.
   * @param {boolean} isCompleted Indicates if task is completed.
   * @param {string} start ISO8601 formatted date string.
   * @param {string} due ISO8601 formatted date string.
   * @param {number} duration Duration in seconds.
   */
  constructor(id, key, summary, isCompleted, start, due, duration) {
    this.id = id;
    this.key = key;
    this.summary = summary;
    this.isCompleted = isCompleted;
    this.start = start;
    this.due = due;
    this.duration = duration;
  }

  /**
   * Tyme issue id of the project.
   * @returns {string}
   */
  get issueId() {
    return 'jira-' + this.id;
  }

  /**
   * Planned duration of issue
   * @returns {number|null} The planned duration in seconds.
   */
  get plannedDuration() {
    const parsedDuration = parseInt(this.duration, 10);

    if (isNaN(parsedDuration) || parsedDuration === null || parsedDuration === undefined) {
      return null;
    }

    return parsedDuration;
  }

  /**
   * Start date of issue.
   * @returns {Date|null}
   */
  get startDate() {
    return this.parseDate(this.start);
  }

  /**
   * Due date of issue.
   * @returns {Date|null}
   */
  get dueDate() {
    return this.parseDate(this.due);
  }

  /**
   * Formatted task name based on import setting.
   * @returns {string} Formatted task name.
   */
  get taskName() {
    switch (formValue.insertIssueNumber) {
      case 'prepend':
        return `[${this.key}] ${this.summary}`;
      case 'append':
        return `${this.summary} [${this.key}]`;
      default:
        return this.summary;
    }
  }

  /**
   * Create or update an existing Tyme task with the data from the Jira issue.
   * @param {Project} project Tyme project for this issue.
   */
  createOrUpdateTymeTask(project) {
    let tymeTask = TimedTask.fromID(this.issueId) ?? TimedTask.create(this.issueId);
    tymeTask.name = this.taskName;
    tymeTask.isCompleted = this.isCompleted;
    tymeTask.plannedDuration = this.plannedDuration;
    tymeTask.startDate = this.startDate;
    tymeTask.dueDate = this.dueDate;
    tymeTask.project = project;
  }

  /**
   * Parses a date string to a JavaScript Date object.
   * @param {string} dateString The date string to be parsed.
   * @returns {Date|null} The parsed date or `null`.
   */
  parseDate(dateString) {
    if (dateString === null || dateString === undefined || dateString?.trim() === '') {
      return null;
    }

    const parsedDate = Date.parse(dateString);
    return isNaN(parsedDate) ? null : parsedDate;
  }
}

/**
 * Jira field configuration.
 */
class JiraFieldConfiguration {
  /**
   * Skipped field configuration.
   */
  static skippedField = { value: 'jira_import_skip', name: utils.localize('input.fields.skip') };

  /**
   *
   * @param {JiraApiClient} client
   * @returns
   */
  constructor(client) {
    this.client = client;
    this.fields = undefined;
  }

  /**
   * Planned duration field.
   * @returns {string|undefined} Returns the field name or `undefined` if field should be skipped.
   */
  get plannedDurationField() {
    return this.skipField(formValue.durationField) ? undefined : formValue.durationField;
  }

  /**
   * Start date field.
   * @returns {string|undefined} Returns the field name or `undefined` if field should be skipped.
   */
  get startDateField() {
    return this.skipField(formValue.startDateField) ? undefined : formValue.startDateField;
  }

  /**
   * Due date field.
   * @returns {string|undefined} Returns the field name or `undefined` if field should be skipped.
   */
  get dueDateField() {
    return this.skipField(formValue.dueDateField) ? undefined : formValue.dueDateField;
  }

  /**
   * Check if field should be skipped for the import.
   * @param {string} field The field value.
   * @returns {boolean} Returns `true` if the field should be skipped.
   */
  skipField(field) {
    field === JiraFieldConfiguration.skippedField.value;
  }

  /**
   * Load Jira field configuration.
   */
  loadFields() {
    this.fields = this.client.fetch('field')?.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get field options for the specified field.
   * @param {string} field The field for which the options should be loaded. Can be one of `plannedDuration`, `startDate` or `dueDate`.
   * @returns {array} Array of options for the given field.
   */
  fieldOptions(fieldOption) {
    if (!this.fields) {
      this.loadFields();
    }

    const filteredFields = this.fields.filter(field => {
      switch (fieldOption) {
        case 'plannedDuration':
          return field?.schema?.type === 'number';
        case 'startDate':
        case 'dueDate':
          return field?.schema?.type === 'date' || field?.schema?.type === 'datetime';
        default:
          return false;
      }
    });

    // Prepend the "Skipped field" configuration
    return [JiraFieldConfiguration.skippedField].concat(
      filteredFields.map(field => {
        return { value: field.id, name: field.name };
      })
    );
  }
}

/**
 * Jira API Client
 */
class JiraApiClient {
  /**
   * Import JQL query.
   */
  get importJql() {
    let excludedProjects = '';

    if (formValue.excludedProjects.trim() !== '') {
      // Build string with excluded projects
      const exclude = formValue.excludedProjects
        .split(',')
        .map(project => project.trim())
        .filter(project => project !== '')
        .map(project => `"${project}"`)
        .join(',');

      if (exclude) {
        excludedProjects = ` AND project NOT IN (${exclude})`;
      }
    }

    return 'assignee = currentUser() AND statuscategory != done' + excludedProjects;
  }

  /**
   * Create a new Jira API Client.
   * @param {string} url Jira URL.
   * @param {string} apiKey Jira API Key.
   * @param {string} user Jira username.
   */
  constructor(url, apiKey, user) {
    this.apiKey = apiKey;
    this.user = user;
    this.baseURL = url + '/rest/api/3/';
  }

  /**
   * Fetch data from the Jira API.
   * @param {string} path Path to request data from.
   * @param {object} params Params to add to the request.
   * @returns {object} Parsed JSON response, or `null`.
   */
  fetch(path, params = null) {
    utils.log(`${this.baseURL}${path}`);
    const headers = {
      Authorization: 'Basic ' + utils.base64Encode(this.user + ':' + this.apiKey),
    };
    const response = utils.request(this.baseURL + path, 'GET', headers, params);
    const statusCode = response['statusCode'];
    const result = response['result'];

    if (statusCode === 200) {
      return JSON.parse(result);
    }
    if (statusCode === 404) {
      return null;
    }

    tyme.showAlert('Jira API Error', JSON.stringify(response));
    return null;
  }

  /**
   * Load issues from Jira.
   * @param {number[]} issueIds Array of issue ids to load. Leave empty to
   *  load all open and assigned issues of the user.
   * @returns {object} Object with issues.
   */
  loadIssues(issueIds) {
    const issues = {};
    let startAt = 0;
    let finished = false;

    do {
      const params = {
        jql: issueIds ? this.updateJql(issueIds) : this.importJql,
        maxResults: 50,
        startAt: startAt,
      };
      const response = this.fetch('search', params);

      if (!response || response.issues.length === 0) {
        finished = true;
      }

      response.issues.forEach(issue => {
        issues[issue.key] = issue;
      });

      startAt += 50;
    } while (!finished);

    utils.log(`Loaded ${Object.keys(issues).length} issues`);

    return issues;
  }

  /**
   * Load an issue from Jira.
   * @param {string} issueKey The issue key.
   * @returns {object} Loaded issue.
   */
  loadIssue(issueKey) {
    return this.fetch('issue/' + issueKey);
  }

  /**
   * Load user data.
   * @returns {boolean} Returns `true` if user data was loaded.
   */
  loadUser() {
    const userResponse = this.fetch('myself');

    if (!userResponse) {
      return false;
    }

    return true;
  }

  /**
   * Update JQL query.
   * @param {number[]} issueIds Array of issue ids.
   */
  updateJql(issueIds) {
    return `id IN (${issueIds.join(',')})`;
  }
}

/**
 * Jira importer
 */
class JiraImporter {
  /**
   * Jira field configuration.
   * @type {JiraFieldConfiguration}
   */
  configuration;

  /**
   * Jira API client.
   * @type {JiraApiClient}
   */
  client;

  /**
   * @type {object}
   */
  issues;

  /**
   * Create a Jira Importer.
   * @param {JiraApiClient} client Jira API Client.
   * @param {JiraFieldConfiguration} configuration Jira field configuration.
   */
  constructor() {
    this.check();
  }

  /**
   * Check that the required fields are filled.
   * @param {boolean} reload Reload fields when they are enabled.
   */
  check(reload = false) {
    if (formValue.jiraURL.trim() !== '' && formValue.jiraKey.trim() !== '' && formValue.jiraUser.trim() !== '') {
      this.createClient();
      this.enableFields(true, reload);
    } else {
      this.enableFields(false);
    }
  }

  /**
   * Create the Jira client and configuration object.
   */
  createClient() {
    this.client = new JiraApiClient(formValue.jiraURL, formValue.jiraKey, formValue.jiraUser);
    this.configuration = new JiraFieldConfiguration(this.client);
  }

  /**
   * Enable or disable additional fields for import.
   * @param {boolean} enable Enable or disable fields. Defaults to `true`.
   * @param {boolean} reload Reloads the fields when enabling it.
   */
  enableFields(enable = true, reload = false) {
    if (formElement.durationField) {
      formElement.durationField.enabled = enable;
      if (enable && reload) {
        formElement.durationField.reload();
      }
    }
    if (formElement.startDateField) {
      formElement.startDateField.enabled = enable;
      if (enable && reload) {
        formElement.startDateField.reload();
      }
    }
    if (formElement.dueDateField) {
      formElement.dueDateField.enabled = enable;
      if (enable && reload) {
        formElement.dueDateField.reload();
      }
    }
  }

  /**
   * Main method to start the import.
   */
  start() {
    // Check if we can load the user data
    if (!this.client.loadUser()) {
      tyme.showAlert(utils.localize('error.failedToLoadUser'));
      return;
    }

    // Load issues from Jira
    this.issues = this.client.loadIssues();

    // Extract project data from issues
    this.projects = {};
    for (let issueKey in this.issues) {
      const projectData = this.issues[issueKey].fields.project;

      if (!projectData) {
        continue; // Skip if project data is undefined
      }

      const project = new JiraProject(projectData.id, projectData.key, projectData.name);
      this.projects[projectData.id] = project;
    }

    // Create projects and process issues
    this.processProjects();
    this.processIssues();

    if (formValue.updateTasks === true) {
      const ids = this.recentlyProcessedIds();

      if (ids.length === 0) {
        // return if there are no tasks to update
        return;
      }

      this.issues = this.client.loadIssues(ids);
      this.processIssues();
    }
  }

  /**
   * Create and update projects for the given projects.
   */
  processProjects() {
    for (let projectId in this.projects) {
      const project = this.projects[projectId];

      if (!project) {
        continue;
      }

      project.createOrUpdateTymeProject();
    }
  }

  /**
   * Create and update tasks for the given issues.
   */
  processIssues() {
    for (let issueKey in this.issues) {
      const issue = this.issues[issueKey];
      const project = this.projects[issue.fields.project.id];

      if (!issue || !project) {
        continue;
      }

      const jiraIssue = new JiraIssue(
        issue.id,
        issue.key,
        issue.fields.summary,
        this.isClosed(issue?.fields?.status?.statusCategory?.key),
        this.configuration.startDateField ? issue?.fields?.[this.configuration.startDateField] : null,
        this.configuration.dueDateField ? issue?.fields?.[this.configuration.dueDateField] : null,
        this.configuration.plannedDurationField ? issue.fields?.[this.configuration.plannedDurationField] : null
      );

      utils.log(JSON.stringify(jiraIssue));

      jiraIssue.createOrUpdateTymeTask(Project.fromID(project.projectId));
    }
  }

  /**
   * Check if status category is a closed status.
   * @param {string} statusCategoryKey Status category of the status.
   * @returns {boolean} `true` if status category is closed.
   */
  isClosed(statusCategoryKey) {
    return statusCategoryKey === 'done';
  }

  /**
   * Extracts the recently processed issue ids from time entries of the
   * selected time frame.
   * @returns {number[]} Array with issue IDs.
   */
  recentlyProcessedIds() {
    let start = new Date();
    start.setDate(start.getDate() - formValue.updateTimeFrame);
    const end = new Date();

    // Load time entries for given time frame
    const timeEntries = tyme.timeEntries(start, end);
    const regex = new RegExp(/(?:jira-)\d+/);

    // Array of issue ids
    const issues = new Set();

    for (const entry of timeEntries) {
      const match = regex.exec(entry.task_id);
      // Skip issues that doesn't match the given regex (i.e. manual created
      // tasks or imported by another importer)
      if (!match) {
        continue;
      }

      // Extract only the issue id
      issues.add(match[0].replace('jira-', ''));
    }

    return Array.from(issues);
  }
}

const importer = new JiraImporter();
