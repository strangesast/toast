import { hashObject } from './util';
import Dexie from 'dexie';
import 'dexie-observable';
const notUrlSafe = /[^a-zA-Z0-9-_\.~]/g;
const COMPONENT_FOLDER_NAME = 'component';
type ElementState = 'unstaged'|'staged'|'commited';
class BaseElement {
  id?: string;
  hash: string = '';
  basedOn: string;
  state: ElementState = 'unstaged'; // unstaged: 0, staged: 1, unchanged: 2 (hash matches content)
  priority: number = 0; // reverse 0 > 1
  modified: Date; // based on commit
  created: Date; // based on commit

  constructor(public job: string, public name: string, public description: string) {
    this.id = Dexie.Observable.createUUID();
    this.updateHash();
    this.modified = new Date();
  }

  static props = ['job', 'parent', 'name', 'description', 'basedOn']; 
  toJSON() {
    let obj = {};
    (<any>this.constructor).props.forEach(prop => obj[prop] = this[prop]);
    return obj;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }

  updateHash() {
    return this.hash = hashObject('blob', this.toString());
  }

  get pk() {
    return this.hash && this.id && [this.hash, this.id];
  }
}

export class FolderElement extends BaseElement {
  constructor(
    job: string,
    name: string,
    description: string,
    public type: string,
    public parent: string = null
  ) {
    super(job, name, description);
  }

  get valid() {
    return true;
  }

  static props = BaseElement.props.concat(['type']);
  static create(obj) {
    return Object.assign(
      Object.create(FolderElement.prototype),
      { description: '', hash: '', state: 'unstaged', parent: null },
      obj
    );
  }
}

export class ComponentElement extends BaseElement {
  constructor(
    job: string,
    name: string,
    description: string,
    public folder: string,
    public parent: string = null
  ) {
    super(job, name, description);
  }

  get valid() {
    return true;
  }

  static props = BaseElement.props.concat(['ref']);
  static create(obj) {
    return Object.assign(
      Object.create(ComponentElement.prototype),
      { description: '', hash: '', state: 'unstaged', parent: null },
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
      { description: '', hash: '', state: 'unstaged' },
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
  state: ElementState = 'unstaged';
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
    this.id = Dexie.Observable.createUUID();
    this.shortname = (shortname || name.split(/[\s_-]+/).join('-')).replace(notUrlSafe, '').toLowerCase().slice(0, 50);
    this.folders = { order: (type === 'job' ? folderTypes || ['phase', 'building'] : []), roots: {} };
    this.updateHash();
    this.modified = new Date();
  }

  static props = ['name', 'shortname', 'description', 'type', 'owner', 'group', 'folders', 'basedOn'];  // what's tracked by git
  static create(obj) {
    return Object.assign(
      Object.create(Collection.prototype),
      { type: 'job', state: 'unstaged', hash: '', folders: { order: obj.type === 'job' ? ['phase', 'building'] : [], roots: {} } },
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

  updateHash() {
    return this.hash = hashObject('blob', this.toString());
  }

  get valid() {
    if (!notUrlSafe.test(this.shortname) && this.owner && this.group && this.folders && true) {
      return true;
    }
    return false;
  }

  get folderRoots() {
    let f = this.folders;
    return f.order.length + 1 == Object.keys(f.roots).length ? f.order.concat(COMPONENT_FOLDER_NAME).map(t => f.roots[t]) : null;
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
