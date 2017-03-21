import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { DataService } from './data.service';
import { GitService } from './git.service';
import { Collection, FolderElement, ComponentElement, InstanceElement, User, Group } from './models';

import { Repo, init } from './git';
import * as sha1 from 'js-sha1';

declare var TextEncoder: any;
declare var TextDecoder: any;
function hashObject(type:string, body:string|Uint8Array) {
  let header = `${ type } ${ body.length }\0`;
  if (typeof body === 'string') {
    return sha1(header + body);

  } else if (body instanceof Uint8Array) {
    let bytes = new TextEncoder().encode(header)
    let c = new Uint8Array(bytes.length + body.length);
    c.set(bytes)
    c.set(body, bytes.length);
    return sha1(c);

  } else {
    throw new Error('invalid body format');
  }
}

// task 1
//   create job
//   set active job
//   create a few example objects
//   create repo
//   add objects to staging
//   determine what's in staging
//   commit to repo
//   add object
//   verify not staged
//   add to staging
//   commit second

// task 2
//   load repo from ref ('master')
//   set active job
//     check that no currently active job
//       anything staged
//   load lastest objects from job
//   make changes
//   stage changes
//   commit changes


// load HEAD commit ref
//   typically 'master' - store current branch somewhere
// load commit
// load tree
// load blobs
//
// modify stage

function rand(arr) {
  return arr[Math.floor(Math.random()*arr.length)];
}

function* range(n) {
  while (n > 0) {
    yield --n;
  }
}

// name, description, shortname, type, owner, group, folderTypes
function createNewJob(...args:any[]) {
  let placeholders = true;
  let collection = new (<any>Collection)(...args);
  let folders = collection.folders.order.concat('component').map(ftype => new FolderElement(
    collection.id,
    'root',
    '',
    ftype,
    null
  ));

  for (let folder of folders) {
    collection.folders.roots[folder.type] = folder.id
  }

  if (placeholders) {
    let examples = folders.map(({ type, id }) => new FolderElement(collection.id, 'Example Folder', 'A placeholder folder.', type, id));
    return { collection, folders: folders.concat(examples) };

  } else {
    return { collection, folders };

  }
}

async function createObjects(num = 3) {
  let { collection, folders } = createNewJob(`Example Job ${ Math.floor(Math.random()*100) }`);

  // create a few folders of each type
  collection.folders.order.concat('component').forEach(ftype => {
    let parents = folders.filter(({ type }) => type == ftype );
    let par = rand(parents);
    folders.push(...Array.from(range(num)).map(i => new FolderElement(
      collection.id,
      `Example Sub-Folder ${ i+1 }`,
      '',
      par.type,
      par.id
    )));
  });

  // create components for later reference, add them to a component folder
  let componentFolders = folders.filter(({ type }) => type == 'component');
  let components = Array.from(range(num)).map(i => new ComponentElement(
    collection.id,
    `Example Component ${ i+1 }`,
    '',
    rand(componentFolders),
    null
  ));

  // create a few instances of components
  let instanceFolders = {};
  collection.folders.order.forEach(ftype => {
    instanceFolders[ftype] = folders.filter(({ type }) => type == ftype);
  });
  let instances = Array.from(range(num)).map(i => new InstanceElement(
    collection.id,
    `Example Instance ${ i+1 }`,
    '',
    rand(components).id,
    Object.assign({}, ...collection.folders.order.map(ftype => ({ [ftype]: rand(instanceFolders[ftype]).id })))
  ));

  // save those objects
  let db = this.db;
  await db.transaction('rw', 'folders', 'components', 'instances', 'collections', () => {
    db.collections.add(collection);
    db.folders.bulkAdd(folders);
    db.components.bulkAdd(components);
    db.instances.bulkAdd(instances);
  });

  return { folders, components, instances, collection };
}

async function status() {
  // compare work to stage
  let db = this.db;
  //let unstagedjobs = await db.collections.where({ state: 'unstaged' }).orderBy('[id+modified]').toArray();
  //let stagedjobs = await db.collections.where({ state: 'staged' }).orderBy('[id+modified]').toArray();
  let stagedJob = await db.collections.orderBy('[id+modified]').toArray();


  // compare stage to index
  return unstagedjobs;
}

async function task1() {
  let result = await createObjects.call(this);

  console.log('created', result);


  let s = await status.call(this);

  console.log(s);

  /*
  let db = this.db;
  // create job
  let job = new Collection();

  // init job root folders
  let types = job.folders.order.concat('component');

  let folders;
  (folders = types.map(t => new FolderElement(job.id, 'root', '', t, null)))
    .forEach(f => job.folders.roots[f.type] = f.id);

  //// set active job
  //this.currentJob.next(job);

  // create example objects
  let NUM = types.length * 3; // four of each type (including root)

  for (let i=0,t;t=types[i % types.length],i<NUM;i++) {
    let pars = folders.filter(f => f.type == t);
    let par = pars[Math.floor(pars.length*Math.random())].id; // choose a random parent of the same type
    let f = new FolderElement(job.id, `Example Folder ${ i+1 }`, '', t, par);
    folders.push(f);
  }

  let components = [];
  for (let i=0; i < NUM; i++) {
    components.push(new ComponentElement(job.id, `Component ${ i }`, '', job.folders.roots['component']))
    console.log(components[i].name);
  }

  let instances = [];
  for (let i=0; i < NUM; i++) {
    let pos = {};
    job.folders.order.forEach(t => {
      let a = folders.filter(({ type }) => type == t);
      pos[t] = a[Math.floor(Math.random()*a.length)].id;
    });

    instances.push(new InstanceElement(job.id, `Instance ${ i }`, '', components[Math.floor(components.length*Math.random())].id, pos));
  }

  await db.transaction('rw', db.collections, db.components, db.folders, db.instances, async function() {
    await db.collections.add(job);
    await db.components.bulkAdd(components);
    await db.instances.bulkAdd(instances);
    await db.folders.bulkAdd(folders);
  });

  let repo = await init(job.shortname, 'git', 1);

  let currentBranch = 'master';
  let commit = await repo.readRef(currentBranch);
  if (commit) {
  }
  */
}

async function task2() {
}

@Injectable()
export class ObjectService implements Resolve<null> {
  currentJob: BehaviorSubject<Collection> = new BehaviorSubject(null);
  repo: Repo;

  constructor(private git: GitService, private db: DataService) { }

  async resolve() {
    await task1.call(this);
  }

  async initializeJob(job) {
  }

  async processRef(repo: Repo, ref) {
    let commitHash = await repo.readRef(ref);

    let commit = await repo.loadAs('commit', commitHash);

    commit
  }
}
