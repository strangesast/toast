import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { DataService } from './data.service';
import { GitService } from './git.service';
import { Collection, FolderElement, ComponentElement, InstanceElement, User, Group } from './models';

import Dexie from 'dexie';
import { Repo, init, modes } from './git';
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

interface DiffStatus {
  id: string;
  committed?: any;
  staged?: any;
  unstaged?: any;
  type: string;
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

function compare(vals) {
  return function(a, b) {
    let i = 0;
    for (let key in vals) if ((i = a[key] > b[key] ? 1 : b[key] > a[key] ? -1 : 0) != 0) return i;
    return i;
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

async function allCollectionsStatus() {
  let db = this.db;
  let collections = await db.collections.orderBy('[id+modified+state]').toArray(); 
  let collectionIds = collections.map(col => col.id);
  let groups = {};

  for (let i=0; i < collectionIds.length;) {
    let group = collections.slice(i, i = collectionIds.lastIndexOf(collectionIds[i]) + 1);
    let states = group.map(({ state }) => state);

    let a = states.lastIndexOf('committed');
    let b = states.lastIndexOf('staged');
    let c = states.lastIndexOf('unstaged');

    groups[group[0].id] = {
      committed: a > -1 ? group[a] : null,
      staged:    b > a  ? group[b] : null,
      unstaged:  c > b  ? group[c] : null
    };
  }

  return groups;
}

async function diffIndex(repo, id, branchName='master', groupTypes = false) {
  let db = this.db;

  // shortname must never change
  let job = await db.collections.get({ id });
  if (!job) throw new Error('no job with that id');

  //let repo = await init(job.shortname, 'testing-git', 1);

  let commitHash = await repo.readRef(branchName);
  
  if (!commitHash) throw new Error('that branch does not exist');

  let commit = await repo.loadAs('commit', commitHash);

  if (!commit) throw new Error('inconsistent git status');

  let tree = await repo.loadAs('tree', commit.tree);

  if (!tree) throw new Error('inconsistent git status');

  let staged = await db.collections.where({ id, state: 'staged' }).sortBy('modified');
  if (staged.length > 1) throw new Error('duplicate elements (collections) staged (same id)');
  staged = staged.length ? staged[0] : null;

  let committed = tree[id];

  let result: DiffStatus[] = [];

  if (staged || committed) {
    result.push({
      id,
      committed: committed ? { hash: committed.hash } : null,
      staged: staged,
      type: db.collections.name
    });
  }

  return result.concat(...await Promise.all([
    stagedIndexed(db.folders,    id, await repo.loadAs('tree', tree.folders.hash)),
    stagedIndexed(db.components, id, await repo.loadAs('tree', tree.components.hash)),
    stagedIndexed(db.instances,  id, await repo.loadAs('tree', tree.instances.hash))
  ]));
}

async function stagedIndexed(table, job, tree) {
  let elements = (await table.where({ job, state: 'staged' }).toArray()).sort(elCmp);
  let ids = elements.map(({ id }) => id);

  if (!ids.every((id, i, arr) => arr.indexOf(id) === i)) throw new Error('duplicate elements staged (same id)');

  let results: DiffStatus[] = [];

  for (let f of elements) {
    let id = f.id;
    let c = tree[id];
    results.push({
      id,
      staged: f,
      committed: c ? { hash: c.hash } : null,
      type: table.name
    });
  }

  return results;
}

// debug only - slow
async function resolveTree(repo, tree) {
  for (let key in tree) {
    let ob = tree[key];
    let type = modes.toType(ob.mode);
    if (type == 'blob') {
      ob.value = JSON.parse(await repo.loadAs('text', ob.hash));
    } else if (type == 'tree') {
      ob.value = await repo.loadAs('tree', ob.hash);
      await resolveTree(repo, ob.value);
    }
  }
}

async function commit(repo, job, message, branchName='master') {
  let commitHash = await repo.readRef(branchName);
  
  if (!commitHash) throw new Error('that branch does not exist');

  let commit = await repo.loadAs('commit', commitHash);

  if (!commit) throw new Error('inconsistent git status');

  let tree = await repo.loadAs('tree', commit.tree);

  let diff = await diffIndex.call(this, repo, job, branchName);

  let changes: any = [];

  for (let change of diff) {
    let ob:any = {};
    ob.path = (change.type != 'collections' ? change.type + '/' : '') + change.id;
    if (change.staged) {
      ob.mode = modes.file;
      ob.content = change.staged.toString();
    }
    changes.push(ob);
  }

  changes.base = commit.tree;

  console.log('repo');
  let treeHash = await repo.createTree(changes);

  //await resolveTree(repo, mergedTree);

}

async function diffTree(jobId) {
  // get the last version in stage
  let db = this.db;

  let versions = await db.collections.where({ id: jobId }).sortBy('modified');
  let states = versions.map(({ state }) => state);
  let a = states.lastIndexOf('staged');
  let b = states.lastIndexOf('unstaged');

  let result: DiffStatus[] = [];

  if (a > -1 || b > -1) {
    result.push({
      id: jobId,
      staged: a > -1 ? versions[a] : null,
      unstaged: b > a ? versions[b] : null,
      type: 'collections'
    });
  }

  return result.concat(...await Promise.all([
    stagedUnstaged(db.folders, jobId),
    stagedUnstaged(db.components, jobId),
    stagedUnstaged(db.instances, jobId)
  ]));
}

var elCmp = compare(['id', 'modified', 'state']);

async function stagedUnstaged(table, job) {
  let arr = (await table.where('[job+state]').anyOf([job, 'staged'], [job, 'unstaged']).toArray()).sort(elCmp);
  let ids = arr.map(({ id }) => id);
  let groups = [];
  for (let i=0; i < arr.length;) {
    let id = arr[i].id;
    let group = arr.slice(i, i = ids.lastIndexOf(ids[i]) + 1);
    let states = group.map(({ state }) => state);
    let a = states.lastIndexOf('staged');
    let b = states.lastIndexOf('unstaged');
    groups.push({
      id,
      staged: a > -1 ? group[a] : null,
      unstaged: b > a ? group[b] : null,
      type: table.name
    });
  }

  return groups;
}

async function descendants(table, rootId, includeRoot = false) {
  let ids, queue, docs = {};
  if (!Array.isArray(rootId) && typeof rootId !== 'string') {
    throw new Error('invalid rootId type');
  }
  ids = queue = typeof rootId === 'string' ? [rootId] : rootId;
  if (includeRoot) await Promise.all(queue.map(async(id) => docs[id] = await table.get(id)));

  do {
    queue = (await table.where('parent').anyOf(queue).toArray()).map(obj => (docs[obj.id] = obj).id);
    if (queue.some(id => ids.indexOf(id) != -1)) throw new Error('parent/child loop');
    ids.push(...queue);
  } while (queue.length);

  if(!includeRoot) {
    ids.splice(ids.indexOf(rootId), 1)
  }

  return { ids, docs };
}

async function createTree(repo, entries) {
  if (!Array.isArray(entries)) {
    entries = Object.keys(entries).map((path) => Object.assign(entries[path], { path }));
  }

  let base = entries.base

  let tree = entries.base && await repo.loadAs('tree', entries.base) || {};

  let blobs = {};

  for (let entry of entries) {
    let fullpath = entry.path;
    let i = fullpath.lastIndexOf('/');
    let [path, fname] = [fullpath.substring(0, i), fullpath.substring(i + 1)];
    let split = path.split('/');
    let prev = tree;
    for (let j=0; j < split.length; j++) {
      let dirname = split[j];
      let ob = prev[dirname];
      if (ob && ob.mode && ob.hash) {
        // assumption that this is a tree (dirname not a fname of something else)
        prev = prev[dirname] = await repo.loadAs('tree', ob.hash);
      } else if (dirname != '') {
        prev = (prev[dirname] || {});
      }
    }
    // if added / modified
    if (entry.mode) {
      prev[fname] = entry;
      blobs[fullpath] = { content: entry.content, mode: entry.mode };
    }
    // if removed (may not have existed, though)
    else {
      delete prev[fname];
    }
  }

  let paths = Object.keys(blobs);
  await Promise.all(paths.map(async(path) => {
    let { content, mode } = blobs[path];
    blobs[path] = { hash: await repo.saveAs(modes.toType(mode), content), mode };
  }));

  async function create(root) {
    for (let prop in root) {
      let val = root[prop];
      // already hashed, good
      if (val.mode && val.hash) {

      }

      // replace with hash calculated above
      else if (val.mode && val.path) {
        root[prop] = blobs[val.path]

      }

      // replace with tree calculation
      else {
        root[prop] = { hash: await create(root[prop]), mode: modes.tree };

      }
    }

    let hash = await repo.saveAs('tree', root);

    return hash;
  }

  let treeHash = await create(tree);
}

async function createRepo(jobId, branchName = 'master') {
  let db = this.db;

  let collection = await db.collections.get({ id: jobId });

  if (collection.state !== 'staged') throw new Error('must init repo from staged collection');

  let repo = await init(collection.shortname, 'testing-git', 1);

  //let { ids: folderIds, docs: folders } = await descendants(db.folders, collection.folderRoots, true);
  //let danglingFolders = (await db.folders.where({ job: jobId }).toArray()).filter(f => folderIds.indexOf(f.id) === -1);

  let folders =    await    db.folders.where({ job: jobId, state: 'staged' }).toArray();
  let components = await db.components.where({ job: jobId, state: 'staged' }).toArray();
  let instances =  await  db.instances.where({ job: jobId, state: 'staged' }).toArray();

  let folderTree = {}, componentTree = {}, instanceTree = {};

  await Promise.all([].concat(
    folders.map(async(ob) => folderTree[ob.id] = {
      hash: await repo.saveAs('text', ob.toString()),
      mode: modes.file
    }),
    components.map(async(ob) => componentTree[ob.id] = {
      hash: await repo.saveAs('text', ob.toString()),
      mode: modes.file
    }),
    instances.map(async(ob) => instanceTree[ob.id] = {
      hash: await repo.saveAs('text', ob.toString()),
      mode: modes.file
    })
  ));

  let treeHash = await repo.saveAs('tree', {
    [collection.id] : {
      hash: await repo.saveAs('text', collection.toString()),
      mode: modes.file
    },
    folders: {
      hash: await repo.saveAs('tree', folderTree),
      mode: modes.tree
    },
    components: {
      hash: await repo.saveAs('tree', componentTree),
      mode: modes.tree
    },
    instances: {
      hash: await repo.saveAs('tree', instanceTree),
      mode: modes.tree
    }
  });

  let commitHash = await repo.saveAs('commit', {
    author: {
      name: 'test',
      email: 'test@example.com'
    },
    tree: treeHash,
    message: 'test'
  });

  await repo.updateRef(branchName, commitHash);

  let results = await Promise.all([
    db.collections.update(collection.pk, { state: 'committed' }),
        db.folders.where('[id+hash]').anyOf(   folders.map(f => f.pk)).modify({ state: 'committed' }),
     db.components.where('[id+hash]').anyOf(components.map(f => f.pk)).modify({ state: 'committed' }),
      db.instances.where('[id+hash]').anyOf( instances.map(f => f.pk)).modify({ state: 'committed' })
  ]);

  if ([1, folders.length, components.length, instances.length].some((l, i) => results[i] !== l)) throw new Error("'committed' update not entirely successful");

  return repo; 
}

async function task1() {
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

  // create
  let result = await createObjects.call(this);

  let db = this.db;

  // add to stage
  await db.collections.where('[id+hash]').equals(result.collection.pk).modify({ state: 'staged' });
  await db.folders.where('[id+hash]').anyOf(result.folders.map(f=>f.pk)).modify({ state: 'staged' });
  await db.components.where('[id+hash]').anyOf(result.components.map(f=>f.pk)).modify({ state: 'staged' });
  await db.instances.where('[id+hash]').anyOf(result.instances.map(f=>f.pk)).modify({ state: 'staged' });

  // create repo from staged
  let repo = await createRepo.call(this, result.collection.id);
  // elements should now be marked 'committed'

  let job = result.collection;
  let parentFolder = await db.folders.where({ job: job.id }).first();

  let testFolder = new FolderElement(job.id, `TEST FOLDER ${ Math.floor(Math.random()*100) }`, '', parentFolder.type, parentFolder.id);
  await db.folders.add(testFolder);

  console.log('f1', testFolder);

  console.log(await diffTree.call(this, job.id));

  // change some stuff
  let anotherFolder = await db.folders.where({ job: job.id, state: 'committed' }).filter(f => f.name != 'root').first();

  anotherFolder.name = anotherFolder.name + ' TEST';
  anotherFolder.modified = new Date();
  anotherFolder.state = 'staged'
  anotherFolder.updateHash();

  await db.folders.put(anotherFolder);

  testFolder.state = 'staged';
  await db.folders.put(testFolder);

  job.name + ' TEST TEST'
  job.modified = new Date();
  job.state = 'staged';
  job.updateHash();
  await db.collections.put(job);

  // check status
  console.log(await diffTree.call(this, job.id));

  console.log(await diffIndex.call(this, repo, job.id));

  await commit.call(this, repo, job.id, 'new test commit');

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
