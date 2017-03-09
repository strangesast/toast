class BaseElement {
  id?: string;
  hash?: string;
  basedOn: string;
  state: number = 0; // unstaged: 0, staged: 1, unchanged: 2 (hash matches content)

  constructor(public job: string, public name: string, public description: string) {}

  static props = ['id', 'job', 'parent', 'name', 'description', 'basedOn']; 
  toJSON() {
    let obj = {};
    (<any>this.constructor).props.forEach(prop => obj[prop] = this[prop]);
    return obj;
  }
  toString() {
    return JSON.stringify(this.toJSON());
  }
}

export class Folder extends BaseElement {
  constructor(job, name, description, public type: string, public parent: string) {
    super(job, name, description);
  }

  static props = BaseElement.props.concat(['type']);
  static create(obj) {
    return Object.assign(
      Object.create(Folder.prototype),
      { description: '', state: 0, parent: null },
      obj
    );
  }
}

export class Component extends BaseElement {
  constructor(job, name, description, public folder: string, public parent: string = null) {
    super(job, name, description);
  }

  static props = BaseElement.props.concat(['ref']);
  static create(obj) {
    return Object.assign(
      Object.create(Component.prototype),
      { description: '', state: 0, parent: null },
      obj
    );
  }
}

export class Instance extends BaseElement {
  constructor(job, name, description, public ref: string, public folders: any = {}) {
    super(job, name, description);
  };

  static props = BaseElement.props.concat(['ref']);
  static create(obj) {
    return Object.assign(
      Object.create(Instance.prototype),
      { description: '', state: 0 },
      obj
    );
  }
}

export class Job {
  id?: string;
  folders: {
    roots: any,
    order: string[]
  }
  hash?: string;
  basedOn: string;
  state: number = 0;

  constructor(
    public name: string, 
    public shortname: string, 
    public description: string, 
    public type: 'job'|'library'='job',
    public owner?: string, 
    public group?: string
  ) {} 

  static props = ['id', 'name', 'shortname', 'description', 'type', 'owner', 'group', 'folders', 'basedOn'];  // what's tracked by git
  static create(obj) {
    return Object.assign(Object.create(Job.prototype), { type: 'job', state: 0 }, obj);
  }
  toJSON() {
    let obj = {};
    Job.props.forEach(prop => obj[prop] = this[prop]);
    return obj;
  }
  toString() {
    return JSON.stringify(this.toJSON());
  }

  get folderRoots() {
    let f = this.folders;
    return f.order.length + 1 == Object.keys(f.roots).length ? f.order.concat('component').map(t => f.roots[t]) : null;
  }
}

export class User {
  constructor(
    public username: string, 
    public name: string, 
    public email: string, 
    public groups: string[] = []
  ) {}

  static props = ['shortname', 'name']; 
  static create(obj) {
    return Object.assign(Object.create(User.prototype), { groups: [] }, obj);
  }
}

export class Group {
  constructor(public shortname: string, public name: string) {}

  static props = ['shortname', 'name']; 
  static create(obj) {
    return Object.assign(Object.create(Group.prototype), obj);
  }
}
