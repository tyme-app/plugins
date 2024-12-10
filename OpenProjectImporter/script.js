/**
 * Tyme Project object.
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name
 * @property {boolean} isCompleted
 */

/**
 * Tyme Project object.
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {boolean} isCompleted
 */

/**
 * Tyme TimedTask object.
 * @typedef {Object} TimedTask
 * @property {string} id
 * @property {string} name
 * @property {boolean} isCompleted
 * @property {number|null} [plannedDuration]
 * @property {Date|null} [startDate]
 * @property {Date|null} [dueDate]
 * @property {Project} project
 */

/**
 * OpenProject category.
 */
class OpenProjectCategory {
  /**
   * Create an OpenProject category.
   * @param {number} id Category ID.
   * @param {string} name Name of the category.
   */
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }

  /**
   * Tyme category ID of this category.
   * @returns {string}
   */
  get tymeCategoryId() {
    return 'openproject-c' + this.id;
  }

  /**
   * Tyme category ID of this category.
   * @deprecated This is the old format. Use the `tymeCategoryId` instead.
   * @returns {string}
   */
  get oldTymeCategoryId() {
    return 'openproject-' + this.id;
  }

  /**
   * Tyme category object for this category.
   * @returns {Category} Tyme `Category` object.
   */
  getCategory() {
    const category = Category.fromID(this.tymeCategoryId);
    if (category) {
      return category;
    }

    // Check for old category and update (can be removed in the future)
    const oldCategory = Category.fromID(this.oldTymeCategoryId);
    if (oldCategory) {
      oldCategory.id = this.tymeCategoryId;
      return oldCategory;
    }

    return Category.create(this.tymeCategoryId);
  }

  /**
   * Create or update an existing category in Tyme.
   */
  createOrUpdateCategory() {
    let tymeCategory = this.getCategory();
    tymeCategory.name = this.name;
  }
}

/**
 * OpenProject project.
 */
class OpenProjectProject {
  /**
   * Create an OpenProject project.
   * @param {string} name Name of the project.
   * @param {boolean} isCompleted Indicates if this project is completed.
   * @param {string} projectUrl URL of the project.
   * @param {string} parentUrl URL of the parent project.
   * @param {OpenProjectCategory?} category Category of this project.
   */
  constructor(name, isCompleted, projectUrl, parentUrl, category) {
    this.name = name;
    this.isCompleted = isCompleted;
    this.projectUrl = projectUrl;
    this.parentUrl = parentUrl;
    this.category = category;
  }

  /**
   * The project id of the project.
   * @returns {number}
   */
  get projectId() {
    return extractProjectIdFromUrl(this.projectUrl);
  }

  /**
   * The project id of the parent project.
   * @returns {number?}
   */
  get parentProjectId() {
    return extractProjectIdFromUrl(this.parentUrl);
  }

  /**
   * Tyme project ID of this project.
   * @returns {string}
   */
  get tymeProjectId() {
    return 'openproject-p' + this.projectId;
  }

  /**
   * Tyme project ID of this project.
   * @deprecated This is the old format. Use the `tymeProjectId` instead.
   * @returns {string}
   */
  get oldTymeProjectId() {
    return 'openproject-' + this.projectId;
  }

  /**
   * Tyme project object for this project.
   * @returns {Project} Tyme `Project` object.
   */
  getProject() {
    const project = Project.fromID(this.tymeProjectId);
    if (project) {
      return project;
    }

    // Check for old project and update (can be removed in the future)
    const oldProject = Project.fromID(this.oldTymeProjectId);
    if (oldProject) {
      oldProject.id = this.tymeProjectId;
      return oldProject;
    }

    return Project.create(this.tymeProjectId);
  }

  /**
   * Create or update an existing project in Tyme.
   */
  createOrUpdateProject() {
    let tymeProject = this.getProject();
    tymeProject.name = this.name;
    tymeProject.isCompleted = this.isCompleted;
    tymeProject.category = this.category ? Category.fromID(this.category.tymeCategoryId) : null;
  }
}

/**
 * OpenProject work package.
 */
class OpenProjectWorkPackage {
  /**
   * Create an OpenProject work package.
   * @param {number} id Work package ID.
   * @param {string} name Name of the work package.
   * @param {string} start Start date of the work package.
   * @param {string} due Due date of the work package.
   * @param {string} estimatedTime Estimated time of the work package.
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
    /** @type {TimedTask} */
    let tymeTask = TimedTask.fromID(this.workPackageId) ?? TimedTask.create(this.workPackageId);
    tymeTask.name = this.createTaskName();
    tymeTask.project = Project.fromID(this.project.tymeProjectId);
    tymeTask.isCompleted = this.isCompleted;
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
   * OpenProject categories.
   */
  categories = {};

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
      return undefined;
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

    if (!this.statuses) {
      this.loadStatuses();
    }

    return this.statuses.find(status => status._links.self.href === statusHref)?.isClosed ?? false;
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
      utils.log(`Work package with id ${workPackageId} could not be loaded.`);
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
   * Get array of project IDs.
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
    const category = this.categoryForProject(project);
    project.category = category;

    this.projects[response.id] = project;

    return project;
  }

  /**
   * Get the category for a given project.
   * @param {OpenProjectProject} project OpenProject project.
   * @returns {OpenProjectCategory} OpenProject category.
   */
  categoryForProject(project) {
    // Find the highest parent of the project
    if (project.parentProjectId) {
      const parentProject = this.loadProject(project.parentProjectId);
      return this.categoryForProject(parentProject);
    }

    // Try to load previous created category
    const cachedCategory = this.categories[project.id];
    if (cachedCategory) {
      return cachedCategory;
    }

    // Create new category
    const category = new OpenProjectCategory(project.projectId, project.name);
    this.categories[project.projectId] = category;

    return category;
  }
}

/**
 * OpenProject Importer class.
 */
class OpenProjectImporter {
  /**
   * Create a new OpenProject Importer.
   * @param {OpenProjectApiClient} client OpenProjectApiClient
   */
  constructor(client) {
    this.apiClient = client;
  }

  /**
   * Starts the OpenProject import.
   */
  start() {
    if (!this.apiClient.loadUser()) {
      tyme.showAlert('Error', utils.localize('error.couldNotLoadUser'));
      return;
    }

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
    for (const categoryId in this.apiClient.categories) {
      const category = this.apiClient.categories[categoryId];
      category.createOrUpdateCategory();
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
 * @returns {number?} Project ID.
 */
function extractProjectIdFromUrl(projectUrl) {
  if (!projectUrl) {
    return null;
  }

  const projectId = projectUrl.substring(projectUrl.lastIndexOf('/') + 1);
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
