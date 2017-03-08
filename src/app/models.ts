class BaseElement {
  id?: string;
  job: string;
  name: string;
  description = '';
  hash?: string;
  state: number = 0; // unstaged: 0, staged: 1, unchanged: 2 (hash matches content)

  static props = ['id', 'job', 'parent', 'name', 'description']; 
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
  type: string; // 'phase', 'building'
  parent: string = null;

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
  parent: string = null;

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
  ref: string;

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
  name: string;
  shortname: string;
  description: string;
  owner: string;
  group: string;
  folders: {
    roots: any,
    order: string[]
  }
  hash?: string;
  state: number = 0;

  static props = ['id', 'name', 'shortname', 'description', 'owner', 'group', 'folders']; 
  static create(obj) {
    return Object.assign(Object.create(Job.prototype), { state: 0 }, obj);
  }
  toJSON() {
    let obj = {};
    Job.props.forEach(prop => obj[prop] = this[prop]);
    return obj;
  }
  toString() {
    return JSON.stringify(this.toJSON());
  }
}

export class User {
  username: string; // prim. key
  name: string;
  email: string;
  groups: string[] = [];

  static props = ['shortname', 'name']; 
  static create(obj) {
    return Object.assign(Object.create(User.prototype), { groups: [] }, obj);
  }
}

export class Group {
  shortname: string; // prim. key
  name: string;

  static props = ['shortname', 'name']; 
  static create(obj) {
    return Object.assign(Object.create(Group.prototype), obj);
  }
}
