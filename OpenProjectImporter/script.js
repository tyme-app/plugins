class OpenProjectApiClient {
  constructor(url, apiKey) {
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
    } else {
      tyme.showAlert('OpenProject API Error', JSON.stringify(response));
      return null;
    }
  }

  /**
   * Load statuses of work packages.
   * @returns Array of statuses.
   */
  loadStatuses() {
    const response = this.getJSON('statuses');

    utils.log(`Loaded ${response.count} statuses`);

    return response._embedded.elements;
  }

  /**
   * Load work packages from OpenProject.
   * @param {Object} additionalParams Additional query params.
   * @returns Array of work packages.
   */
  loadWorkPackages(additionalParams = {}) {
    const assignedToMe = '[{"status":{"operator":"o","values":[]}},{"assignee":{"operator":"=","values":["me"]}}]';
    let workPackages = {};
    let page = 1;
    let finished = false;

    do {
      const params = {
        offset: page,
        pageSize: 100,
        filters: assignedToMe,
        ...additionalParams,
      };
      const response = this.getJSON('work_packages', params);

      if (!response || response.count === 0) {
        finished = true;
      }

      response._embedded.elements.forEach(
        function (workPackage) {
          const id = workPackage['id'];
          workPackages[id] = workPackage;
        }.bind(this)
      );

      page++;
    } while (!finished);

    utils.log(`Loaded ${Object.keys(workPackages).length} work packages`);

    return workPackages;
  }

  /**
   * Load a work package from OpenProject.
   * @param {*} workPackageID The work package ID.
   * @returns Loaded work package.
   */
  loadWorkPackage(workPackageID) {
    return this.getJSON('work_packages/' + workPackageID);
  }

  /**
   * Load multiple projects from OpenProject.
   *
   * This will make a request for each project.
   * @param {*} projectIDs Array of project IDs.
   * @returns Array of projects.
   */
  loadProjects(projectIDs) {
    let projects = {};

    for (const projectID of projectIDs) {
      const response = this.loadProject(projectID);

      if (!response) {
        utils.log(`Project with id ${projectID} could not be loaded.`);
        continue;
      }

      const id = response.id;
      projects[id] = response;
    }

    utils.log(`Loaded ${Object.keys(projects).length} projects`);

    return projects;
  }

  /**
   * Load a project from OpenProject.
   * @param {number} projectID The project ID.
   * @returns Loaded project.
   */
  loadProject(projectID) {
    return this.getJSON('projects/' + projectID);
  }
}

class OpenProjectImporter {
  constructor(url, apiKey) {
    this.apiClient = new OpenProjectApiClient(url, apiKey);
  }

  start() {
    if (!this.loadUser()) {
      tyme.showAlert('Could not load user. Check your entered API Key and URL.');
      return;
    }

    this.status = this.apiClient.loadStatuses();

    if (formValue.updateTasks) {
      this.updateRecentWorkPackages();
    }

    this.workPackages = this.apiClient.loadWorkPackages();

    // Extract project ids from work packages and load projects
    const projectIDs = new Set();
    for (let workPackageID in this.workPackages) {
      const workPackage = this.workPackages[workPackageID];
      const projectURL = workPackage._links.project.href;
      projectIDs.add(this.extractProjectID(projectURL));
    }
    this.projects = this.apiClient.loadProjects(projectIDs);

    // Load project categories
    const categoryIDs = new Set();
    for (let projectID in this.projects) {
      const project = this.projects[projectID];
      const categoryID = this.getCategoryIDFromProject(project);
      if (categoryID) {
        categoryIDs.add(categoryID);
      }
    }
    this.categories = Array.from(categoryIDs);

    // Create projects and work packages
    this.processData();
  }

  /**
   * Extracts the project id from a work package.
   * @param {*} workPackage Work package.
   * @returns Project ID.
   */
  extractProjectID(projectURL) {
    if (!projectURL) {
      return null;
    }
    const n = projectURL.lastIndexOf('/');
    const projectID = projectURL.substring(n + 1);
    return parseInt(projectID);
  }

  /**
   * Get category id from project.
   * @param {*} project Project.
   * @returns {number|null} Category ID (Project ID).
   */
  getCategoryIDFromProject(project) {
    const parent = project?._links?.parent?.href;

    if (!parent) {
      return project.id;
    }

    return this.extractProjectID(parent);
  }

  processData() {
    for (let categoryID of this.categories) {
      const category = this.projects[categoryID] ?? this.apiClient.loadProject(categoryID);
      const id = 'openproject-' + categoryID;

      let tymeCategory = Category.fromID(id) ?? Category.create(id);
      tymeCategory.name = category.name;
    }

    for (let projectID in this.projects) {
      const project = this.projects[projectID];

      if (!project) {
        continue;
      }

      this.createOrUpdateProject(project);
    }

    for (let workPackageID in this.workPackages) {
      const workPackage = this.workPackages[workPackageID];

      if (!workPackage) {
        continue;
      }

      this.createOrUpdateTask(workPackage);
    }
  }

  /**
   * Creates or updates an existing project in Tyme.
   * @param {*} project Project from OpenProject.
   */
  createOrUpdateProject(project) {
    const id = 'openproject-' + project.id;

    let tymeProject = Project.fromID(id) ?? Project.create(id);
    tymeProject.name = project.name;
    tymeProject.isCompleted = !project.active;

    const categoryID = 'openproject-' + this.getCategoryIDFromProject(project);
    tymeProject.category = Category.fromID(categoryID);
  }

  /**
   * Creates or updates an existing task in Tyme with the data from the work package.
   * @param {*} workPackage Work package from OpenProject.
   */
  createOrUpdateTask(workPackage) {
    const id = 'openproject-' + workPackage.id;
    const projectID = 'openproject-' + this.extractProjectID(workPackage?._links?.project?.href);

    let tymeTask = TimedTask.fromID(id) ?? TimedTask.create(id);
    tymeTask.name = this.createTaskName(workPackage.subject, workPackage.id);
    tymeTask.isCompleted = this.isClosed(workPackage._links.status.href);
    const project = Project.fromID(projectID);
    tymeTask.project = project;

    if (project.isCompleted) {
      tymeTask.isCompleted = true;
    }

    if (workPackage['startDate']) {
      tymeTask.startDate = Date.parse(workPackage['startDate']);
    } else {
      tymeTask.startDate = null;
    }

    if (workPackage['dueDate']) {
      tymeTask.dueDate = Date.parse(workPackage['dueDate']);
    } else {
      tymeTask.dueDate = null;
    }

    if (workPackage['estimatedTime']) {
      tymeTask.plannedDuration = extractEstimate(workPackage['estimatedTime']);
    } else {
      tymeTask.plannedDuration = null;
    }
  }

  /**
   * Creates the task name from a work package name and id.
   * @param {string} name Name for the task.
   * @param {string} id ID of the work package.
   * @returns Task name based on import setting.
   */
  createTaskName(name, id) {
    switch (formValue.insertWorkPackageNumber) {
      case 'prepend':
        return `[${id}] ${name}`;
      case 'append':
        return `${name} [${id}]`;
      default:
        return name;
    }
  }

  loadUser() {
    const userResponse = this.apiClient.getJSON('users/me');
    if (!userResponse) {
      return false;
    }

    this.userID = userResponse['id'];

    return true;
  }

  /**
   * Check if the given status (href) from OpenProject is a closed status.
   * @param {string} statusHref Href of the status (i.e. "/api/v3/statuses/1").
   * @returns {boolean} `true` if the given status is closed.
   */
  isClosed(statusHref) {
    return this.status.find(status => status._links.self.href == statusHref).isClosed;
  }

  /**
   * Updates recent processed work packages.
   */
  updateRecentWorkPackages() {
    const workPackagesToUpdate = this.recentlyProcessedWorkPackageIDs();

    for (const workPackageID of workPackagesToUpdate) {
      const response = this.apiClient.loadWorkPackage(workPackageID);
      if (response) {
        utils.log('Update Work Package #' + workPackageID);
        this.createOrUpdateTask(response);
      }
    }
  }

  /**
   * Extracts the recently processed work packages from the time entries of
   * the selected time frame.
   * @returns Array with work package IDs.
   */
  recentlyProcessedWorkPackageIDs() {
    let start = new Date();
    start.setDate(start.getDate() - formValue.updateTimeFrame);
    const end = new Date();

    // Load time entries for given time frame
    const timeEntries = tyme.timeEntries(start, end);
    const regex = new RegExp(/(?:openproject-)\d+/);

    // Array of work packages
    const workPackageIDs = new Set();

    for (const entry of timeEntries) {
      const match = regex.exec(entry.task_id);
      if (!match) {
        continue;
      }

      // Extract only the work package id
      workPackageIDs.add(match[0].replace('openproject-', ''));
    }

    return Array.from(workPackageIDs);
  }
}

const importer = new OpenProjectImporter(formValue.openProjectURL, formValue.openProjectKey);

// HELPER

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
