const notUrlSafe = /[^a-zA-Z0-9-_\.~]/g;
class BaseElement {
  id?: string;
  hash: string = '';
  basedOn: string;
  state: number = 0; // unstaged: 0, staged: 1, unchanged: 2 (hash matches content)
  priority: number = 0; // reverse 0 > 1
  modified: Date; // based on commit
  created: Date; // based on commit

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

  get pk() {
    return this.hash && this.id && [this.hash, this.id];
  }
}

export class FolderElement extends BaseElement {
  constructor(job, name, description, public type: string, public parent: string) {
    super(job, name, description);
  }

  get valid() {
    return true;
  }

  static props = BaseElement.props.concat(['type']);
  static create(obj) {
    return Object.assign(
      Object.create(FolderElement.prototype),
      { description: '', hash: '', state: 0, parent: null },
      obj
    );
  }
}

export class ComponentElement extends BaseElement {
  constructor(job, name, description, public folder: string, public parent: string = null) {
    super(job, name, description);
  }

  get valid() {
    return true;
  }

  static props = BaseElement.props.concat(['ref']);
  static create(obj) {
    return Object.assign(
      Object.create(ComponentElement.prototype),
      { description: '', hash: '', state: 0, parent: null },
      obj
    );
  }
}

export class InstanceElement extends BaseElement {
  constructor(job, name, description, public ref: string, public folders: any = {}) {
    super(job, name, description);
  };

  get valid() {
    return true;
  }

  static props = BaseElement.props.concat(['ref']);
  static create(obj) {
    return Object.assign(
      Object.create(InstanceElement.prototype),
      { description: '', hash: '', state: 0 },
      obj
    );
  }
}

export class Collection {
  id?: string;
  folders: {
    roots: any,
    order: string[]
  }
  hash: string = '';
  basedOn: string;
  state: number = 0;
  modified: Date;   // based on commit
  created: Date;    // based on commit

  constructor(
    public name: string, 
    public description: string = '', 
    public shortname?: string, 
    public type: 'job'|'library'='job',
    public owner?: string, 
    public group?: string,
    folderTypes?: string[]
  ) {
    this.shortname = (shortname || name.split(/[\s_-]+/).join('-')).replace(notUrlSafe, '');
    this.folders = { order: type === 'job' ? ['phase', 'building'] : [], roots: {} };
  }

  static props = ['id', 'name', 'shortname', 'description', 'type', 'owner', 'group', 'folders', 'basedOn'];  // what's tracked by git
  static create(obj) {
    return Object.assign(
      Object.create(Collection.prototype),
      { type: 'job', state: 0, hash: '', folders: { order: obj.type === 'job' ? ['phase', 'building'] : [], roots: {} } },
      obj
    );
  }

  toJSON() {
    let obj = {};
    Collection.props.forEach(prop => obj[prop] = this[prop]);
    return obj;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }

  get valid() {
    if (!notUrlSafe.test(this.shortname) && this.owner && this.group && this.folders && true) {
      return true;
    }
    return false;
  }

  get folderRoots() {
    let f = this.folders;
    return f.order.length + 1 == Object.keys(f.roots).length ? f.order.concat('component').map(t => f.roots[t]) : null;
  }

  get initialized() {
    return this.id && this.folders && Object.keys(this.folders.roots).length == this.folders.order.length + 1;
  }

  get pk() {
    return this.hash && this.id && [this.hash, this.id];
  }
}

export class User {
  public modified: Date;
  public created: Date;

  constructor(
    public username: string, 
    public name: string, 
    public email: string, 
    public groups: string[] = []
  ) {}

  get valid() {
    return (this.username && this.email && this.groups && this.name && true) || false;
  }

  static props = ['shortname', 'name']; 
  static create(obj) {
    return Object.assign(Object.create(User.prototype), { groups: [] }, obj);
  }

  get pk() {
    return this.username;
  }
}

export class Group {
  public modified: Date;
  public created: Date;

  constructor(public shortname: string, public name: string) {}

  get valid() {
    return true;
  }

  static props = ['shortname', 'name']; 
  static create(obj) {
    return Object.assign(Object.create(Group.prototype), obj);
  }

  get pk() {
    return this.shortname;
  }
}

export class History {
  private current = 0;

  constructor(private arr=[], public maxLength=-1) {}

  add(next, previous): void {
    if (this.current != 0) {
      this.arr = this.arr.slice(this.current);
      this.current = 0;
    }

    this.arr.unshift([next, previous]);

    if (this.maxLength > -1) {
      this.arr = this.arr.slice(0, this.maxLength);
    }
  }

  step(amt) {
    let a = Math.max(Math.min(this.current + amt, this.length), 0);
    let b = this.current;

    let arr = this.arr.slice(Math.min(a, b), Math.max(a, b))

    if (a < b) {
      // apply changes
      for (let i=arr.length - 1; i > 0; i--) {
        arr[i] // apply this change
      }

    } else if (a > b) {
      // undo changes
      for (let i=0; i < arr.length; i++) {
        arr[i] // undo this change
      }

    } else {
      // do nothing;
    }

    this.current = a;
  }

  get length() {
    return this.arr.length;
  }

  get list() {
    return [];
  }
}
