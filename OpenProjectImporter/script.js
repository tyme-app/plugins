/**
 * OpenProject project.
 */
class OpenProjectProject {
  /**
   * Create an OpenProject Project.
   * @param {string} name Name of the project.
   * @param {boolean} isCompleted Indicates if this project is completed.
   * @param {string} projectUrl URL of the project.
   * @param {string?} parentUrl URL of the parent project.
   */
  constructor(name, isCompleted, projectUrl, parentUrl) {
    this.name = name;
    this.isCompleted = isCompleted;
    this.projectUrl = projectUrl;
    this.parentUrl = parentUrl;
  }

  /**
   * The project id of the project.
   * @returns {number}
   */
  get projectId() {
    return extractProjectIdFromUrl(this.projectUrl);
  }

  /**
   * The category id of the project.
   * @returns {number}
   */
  get categoryId() {
    if (!this.parentUrl) {
      return this.projectId;
    }

    return extractProjectIdFromUrl(this.parentUrl);
  }

  /**
   * Tyme project ID of this project.
   * @returns {string}
   */
  get tymeProjectId() {
    return 'openproject-' + this.projectId;
  }

  /**
   * Tyme category ID of this project.
   */
  get tymeCategoryId() {
    return 'openproject-' + this.categoryId;
  }

  /**
   * Create or update an existing project in Tyme.
   */
  createOrUpdateProject() {
    let tymeProject = Project.fromID(this.tymeProjectId) ?? Project.create(this.tymeProjectId);
    tymeProject.name = this.name;
    tymeProject.isCompleted = !this.active;
    tymeProject.category = Category.fromID(this.tymeCategoryId);
  }
}

/**
 * OpenProject work package.
 */
class OpenProjectWorkPackage {
  /**
   *
   * @param {number} id Work package ID.
   * @param {string} name Name of the work package.
   * @param {boolean} isCompleted Indicates if this work package is completed.
   * @param {OpenProjectProject} project Project of this work package.
   */
  constructor(id, name, start, due, estimatedTime, isCompleted, project) {
    this.id = id;
    this.name = name;
    this.start = start;
    this.due = due;
    this.estimatedTime = estimatedTime;
    this.isCompleted = isCompleted;
    this.project = project;
  }

  /**
   * Tyme task ID of this work package.
   * @returns {string}
   */
  get workPackageId() {
    return 'openproject-' + this.id;
  }

  /**
   * Planned duration of the work package.
   * @returns {number?}
   */
  get plannedDuration() {
    if (!this.estimatedTime) {
      return;
    }

    return extractEstimate(this.estimatedTime);
  }

  /**
   * Parsed start date of the work package.
   * @returns {Date?}
   */
  get startDate() {
    return this.parseDate(this.start);
  }

  /**
   * Parsed due date of the work package.
   * @returns {Date?}
   */
  get dueDate() {
    return this.parseDate(this.due);
  }

  /**
   * Create or update an existing task in Tyme with the data from the work package.
   */
  createOrUpdateTask() {
    let tymeTask = TimedTask.fromID(this.workPackageId) ?? TimedTask.create(this.workPackageId);
    tymeTask.name = this.createTaskName();
    tymeTask.project = Project.fromID(this.project.tymeProjectId);
    tymeTask.isCompleted = this.isCompleted;
    tymeTask.isCompleted = this.isCompleted ?? false;
    tymeTask.startDate = this.startDate;
    tymeTask.dueDate = this.dueDate;
    tymeTask.plannedDuration = this.plannedDuration;
  }

  /**
   * Creates the task name from a work package name and id.
   * @returns Task name based on import setting.
   */
  createTaskName() {
    switch (formValue.insertWorkPackageNumber) {
      case 'prepend':
        return `[${this.id}] ${this.name}`;
      case 'append':
        return `${this.name} [${this.id}]`;
      default:
        return this.name;
    }
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
 * OpenProject API client.
 */
class OpenProjectApiClient {
  /**
   * Work package statuses.
   */
  statuses;

  /**
   * OpenProject projects.
   */
  projects = {};

  /**
   * Create a new OpenProjectApiClient.
   * @param {string} url OpenProject URL.
   * @param {string} apiKey OpenProject API key.
   */
  constructor(url, apiKey) {
    if (OpenProjectApiClient._instance) {
      return OpenProjectApiClient._instance;
    }
    OpenProjectApiClient._instance = this;

    this.apiKey = apiKey;
    this.baseURL = url + '/api/v3/';
  }

  getJSON(path, params = null) {
    utils.log(this.baseURL + path);
    const headers = {
      Authorization: 'Basic ' + utils.base64Encode('apikey:' + this.apiKey),
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

    tyme.showAlert('OpenProject API Error', JSON.stringify(response));
    return null;
  }

  /**
   * Load user.
   * @returns {boolean} Returns `true` if user could be loaded.
   */
  loadUser() {
    if (!this.getJSON('users/me')) {
      return false;
    }

    return true;
  }

  /**
   * Load statuses of work packages.
   * @returns {void}
   */
  loadStatuses() {
    const response = this.getJSON('statuses');

    utils.log(`Loaded ${response.count} statuses`);

    this.statuses = response._embedded.elements;
  }

  /**
   * Check if the given status (href) from OpenProject is a closed status.
   * @param {string} statusHref Href of the status (i.e. "/api/v3/statuses/1").
   * @returns {boolean} Returns `true` if the given status is closed.
   */
  isClosed(statusHref) {
    if (!statusHref) {
      return false;
    }

    return this.statuses.find(status => status._links.self.href == statusHref).isClosed;
  }

  /**
   * Load work packages from OpenProject.
   * @returns Object with work package IDs as keys and work packages.
   */
  loadWorkPackages() {
    const assignedToMe = '[{"status":{"operator":"o","values":[]}},{"assignee":{"operator":"=","values":["me"]}}]';
    let workPackages = {};
    let page = 1;
    let finished = false;

    do {
      const params = {
        offset: page,
        pageSize: 100,
        filters: assignedToMe,
      };
      const response = this.getJSON('work_packages', params);

      if (!response || response.count === 0) {
        finished = true;
      }

      response._embedded.elements.forEach(workPackage => {
        const project = this.loadProject(extractProjectIdFromUrl(workPackage?._links?.project?.href));
        workPackages[workPackage.id] = new OpenProjectWorkPackage(
          workPackage.id,
          workPackage.subject,
          workPackage.startDate,
          workPackage.dueDate,
          workPackage.estimatedTime,
          this.isClosed(workPackage?._links?.status?.href),
          project
        );
      });

      page++;
    } while (!finished);

    utils.log(`Loaded ${Object.keys(workPackages).length} work packages`);

    return workPackages;
  }

  /**
   * Load a work package from OpenProject.
   * @param {number} workPackageId The work package ID.
   * @returns {OpenProjectWorkPackage?} Loaded work package.
   */
  loadWorkPackage(workPackageId) {
    const response = this.getJSON('work_packages/' + workPackageId);

    if (!response) {
      tils.log(`Work package with id ${workPackageId} could not be loaded.`);
      return null;
    }

    const project = this.loadProject(extractProjectIdFromUrl(response?._links?.project?.href));

    return new OpenProjectWorkPackage(
      response.id,
      response.subject,
      response.startDate,
      response.dueDate,
      response.estimatedTime,
      this.isClosed(response?._links?.status?.href),
      project
    );
  }

  /**
   *
   * @returns {number[]}
   */
  getProjectIds() {
    return Object.keys(this.projects).map(key => parseInt(key));
  }

  /**
   * Load multiple projects from OpenProject.
   *
   * This will make a request for each project.
   * @param {number[]} projectIds Array of project IDs.
   * @returns Object with project IDs as keys and projects.
   */
  loadProjects(projectIds) {
    let projects = {};

    for (const projectId of projectIds) {
      const project = this.loadProject(projectId);

      if (!project) {
        continue;
      }

      projects[project.id] = project;
    }

    utils.log(`Loaded ${Object.keys(projects).length} projects`);

    return projects;
  }

  /**
   * Load a project from OpenProject.
   * @param {number} projectId The project ID.
   * @returns {OpenProjectProject?} Loaded project.
   */
  loadProject(projectId) {
    // Check if project was already loaded, so return it
    const cachedProject = this.projects[projectId];
    if (cachedProject) {
      return cachedProject;
    }

    // Load project from OpenProject
    const response = this.getJSON('projects/' + projectId);

    if (!response) {
      utils.log(`Project with id ${projectId} could not be loaded.`);
      return null;
    }

    const project = new OpenProjectProject(
      response.name,
      !response.active,
      response._links.self.href,
      response?._links?.parent?.href
    );

    this.projects[response.id] = project;

    return project;
  }
}

class OpenProjectImporter {
  /**
   * Create a new OpenProject Importer.
   * @param {OpenProjectApiClient} client OpenProjectApiClient
   */
  constructor(client) {
    this.apiClient = client;
  }

  /**
   * Starts the import.
   */
  start() {
    if (!this.apiClient.loadUser()) {
      tyme.showAlert('Error', utils.localize('error.couldNotLoadUser'));
      return;
    }

    // Load statuses for work packages
    this.apiClient.loadStatuses();

    // Update workpackages if they should be updated by time entries
    if (formValue.updateTasks) {
      this.updateRecentWorkPackages();
    }

    // Load work packages from OpenProject
    const workPackages = this.apiClient.loadWorkPackages();

    // Create projects and work packages
    this.processCategories();
    this.processProjects();
    this.processTasks(workPackages);
  }

  /**
   * Process categories.
   */
  processCategories() {
    for (const projectId of this.apiClient.getProjectIds()) {
      const project = this.apiClient.loadProject(projectId);
      let tymeCategory = Category.fromID(project.tymeCategoryId) ?? Category.create(project.tymeCategoryId);
      tymeCategory.name = project.name;
    }
  }

  /**
   * Process projects.
   */
  processProjects() {
    for (const projectId of this.apiClient.getProjectIds()) {
      const project = this.apiClient.loadProject(projectId);

      if (!project) {
        continue;
      }

      project.createOrUpdateProject();
    }
  }

  /**
   * Process tasks.
   * @param {object} workPackages
   */
  processTasks(workPackages) {
    for (const workPackageId in workPackages) {
      const workPackage = workPackages[workPackageId];
      workPackage.createOrUpdateTask();
    }
  }

  /**
   * Updates recent processed work packages.
   */
  updateRecentWorkPackages() {
    const workPackagesToUpdate = this.recentlyProcessedWorkPackageIds();

    for (const workPackageId of workPackagesToUpdate) {
      const workPackage = this.apiClient.loadWorkPackage(workPackageId);
      if (workPackage) {
        utils.log('Update Work Package #' + workPackageId);
        workPackage.createOrUpdateTask();
      }
    }
  }

  /**
   * Extracts the recently processed work packages from the time entries of
   * the selected time frame.
   * @returns {number[]} Array with work package IDs.
   */
  recentlyProcessedWorkPackageIds() {
    let start = new Date();
    start.setDate(start.getDate() - formValue.updateTimeFrame);
    const end = new Date();

    // Load time entries for given time frame
    const timeEntries = tyme.timeEntries(start, end);
    const regex = new RegExp(/(?:openproject-)\d+/);

    // Array of work packages
    const workPackageIds = new Set();

    for (const entry of timeEntries) {
      const match = regex.exec(entry.task_id);
      if (!match) {
        continue;
      }

      // Extract only the work package id
      workPackageIds.add(match[0].replace('openproject-', ''));
    }

    return Array.from(workPackageIds);
  }
}

const client = new OpenProjectApiClient(formValue.openProjectURL, formValue.openProjectKey);
const importer = new OpenProjectImporter(client);

// HELPER

/**
 * Extract the project ID from a project URL.
 * @param {string} projectUrl Project URL.
 * @returns {number} Project ID.
 */
function extractProjectIdFromUrl(projectUrl) {
  if (!projectUrl) {
    return null;
  }

  const n = projectUrl.lastIndexOf('/');
  const projectId = projectUrl.substring(n + 1);
  return parseInt(projectId);
}

/**
 * Extracts the estimated time from an ISO 8601 duration.
 * @param {*} estimateString ISO 8601 duration string.
 * @returns Estimated duration in seconds.
 */
function extractEstimate(estimateString) {
  var matches = estimateString.match(
    /(-)?P(?:([.,\d]+)Y)?(?:([.,\d]+)M)?(?:([.,\d]+)W)?(?:([.,\d]+)D)?(?:T(?:([.,\d]+)H)?(?:([.,\d]+)M)?(?:([.,\d]+)S)?)?/
  );

  const duration = {
    isNegative: matches[1] !== undefined,
    years: matches[2] ?? 0,
    months: matches[3] ?? 0,
    weeks: matches[4] ?? 0,
    days: matches[5] ?? 0,
    hours: matches[6] ?? 0,
    minutes: matches[7] ?? 0,
    seconds: matches[8] ?? 0,
  };

  let estimateInSeconds = 0;
  // TODO: Calculate months and years
  estimateInSeconds += 60 * 60 * 24 * 7 * duration.weeks;
  estimateInSeconds += 60 * 60 * 24 * duration.days;
  estimateInSeconds += 60 * 60 * duration.hours;
  estimateInSeconds += 60 * duration.minutes;
  estimateInSeconds += duration.seconds;

  return estimateInSeconds;
}
