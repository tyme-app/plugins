# Importing Data

To import data into Tyme, you can first use the built-in calls to either fetch the data form a webserver or let the user choose a file from the disk.

Then you can use the following classes in a plugin script to create the entire project structure, tasks, time entries, rides and expenses. 

> Note that every object in Tyme needs to have its own **unique ID**. 
> Duplicated IDs can lead to **unpredictable behavior**!
> 
> The **unique ID** is an alphanumeric value. Please add a prefix to avoid possible ID clashes.

This example checks, if a category exists, creates one on demand, creates a new project and connects it to the category:

```javascript
let category = Category.fromID("prefix_id1");
if (category === null) {
    category = Category.create("prefix_id1");
    category.name = "My Category";
}

let project = Project.create("prefix_id2");
project.name = "My Project";
project.category = category;
```

## List of available classes

```javascript
class Category {
    id // string
    name // string
    color // numeric value (0x334455)
    isCompleted // bool
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class Project {
    id // string
    name // string
    isCompleted // bool
    color // numeric value (0x334455)
    defaultHourlyRate // float
    plannedBudget // float
    plannedDuration // int, seconds
    trackingMode // int, 0=slot, 1=cluster
    startDate // date, optional
    dueDate // date, optional
    category // the category the project is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class TimedTask {
    id // string
    name // string
    isCompleted // bool
    billable // bool
    hourlyRate // float
    roundingMethod // int, down=0, nearest=1, up=2
    roundingMinutes // int
    plannedBudget // float
    plannedDuration // int, seconds
    startDate // date, optional
    dueDate // date, optional
    project // the project the task is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class TimedSubtask {
    id // string
    name // string
    isCompleted // bool
    billable // bool
    hourlyRate // float
    plannedBudget // float
    plannedDuration // int, seconds
    startDate // date, optional
    dueDate // date, optional
    parentTask // the task the sub-task is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class TimedTaskRecord {
    id // string
    billingState // unbilled=0, billed=1, paid=2
    note // string
    timeStart // date
    timeEnd // date
    userID // string, optional
    parentTask // the task the record is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class MileageTask {
    id // string
    name // string
    isCompleted // bool
    billable // bool
    kilometerRate // float, kilometers
    plannedBudget // float
    project // the project the task is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class MileageTaskRecord {
    id // string
    billingState // unbilled=0, billed=1, paid=2
    traveledDistance // float, kilometers
    note // string
    timeStart // date
    timeEnd // date
    userID // string, optional
    parentTask // the task the record is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class ExpenseGroup {
    id // string
    name // string
    isCompleted // bool
    billable // bool
    plannedBudget // float
    project // the project the group is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

```javascript
class Expense {
    id // string
    name // string
    note // string
    isCompleted // bool
    billable // bool
    quantity // float
    price // float
    purchaseDate // date
    userID // string, optional
    group // the group the expense is contained in
    static create(id)
    static fromID(id)
    delete()
}
```

