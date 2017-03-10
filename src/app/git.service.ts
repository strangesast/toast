import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import * as deep from 'deep-diff';

import { Observable } from 'rxjs';

import { DataService } from './data.service';

import { User, Group, Job, Folder, Instance, Component } from './models';
import { calcHash, modes, init, Repo, Commit } from './git';
import { startsWith } from './indexeddb';

class Status {
  constructor(public id: string, public current: any, public previous?: any, public detached?: boolean) {}

  get diff() { return deep.diff(this.previous, this.current); } 
  get status() {
    return (this.current && this.previous) ? (this.diff ? 'modified' : 'same') : !this.previous ? 'created' : 'deleted';
  }
};

let GROUP = {
  shortname: 'testg'
};
let USER = {
  username: 'test_test',
  name: 'Test Test',
  email: 'test@example.com'
};
let JOB = {
  name: 'Test Job',
  shortname: 'test_job',
  description: 'a test job for testing',
  owner: '',
  group: '',
  folders: {
    order: ['phase', 'building'],
    roots: {}
  }
};
let CONFIG = {
  folders: {
    order: ['phase', 'building'],
    roots: {},
    enabled: {}
  },
  component: {
    enabled: true
  }
}

function comparer(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

@Injectable()
export class GitService implements Resolve<any> {
  gitdb: IDBDatabase;
  repo: Repo;

  constructor(private db: DataService) {}

  resolve() {
    return this.init();
  }

  async init() {

    // repo, name, version, prefix
    let prefix = 'toast';
    let repo = await init(prefix, 'test', 1);
    let db = this.db;

    let master = await repo.readRef('master');

    if (!master) {
      let job = await db.jobs.get({ shortname: JOB.shortname });
      if (!job) {
        job = Job.create(JOB)
        job.state = 2; // commited
        job.id = await db.jobs.add(job);
      }

      let owner;
      if (!job.owner) {
        owner = await db.users.get({ username: USER.username });
        if (!owner) {
          owner = User.create(USER);
          await db.users.add(owner);
        }
        job.owner = owner.username;
      }

      if (!job.group) {
        let group = await db.groups.get({ shortname: GROUP.shortname });
        if (!group) {
          group = Group.create(GROUP);
          await db.groups.add(group);
        }
        job.group = group.shortname;
        if (owner.groups.indexOf(group.shortname) == -1) {
          owner.groups.push(group.shortname);
        }
      }

      if (job.folders.order.length + 1 != Object.keys(job.folders.roots).length) {
        let types = job.folders.order.concat('component');
        for (let i=0, type; type=types[i], i<types.length; i++) {
          let id = job.folders.roots[type]
          if (id) continue;
          let folder = Folder.create({ name: 'root', type, job: job.id, state: 2 });
          folder.id = await db.folders.add(folder);
          job.folders.roots[type] = folder.id;
        }
      }

      let { ids, docs } = await this.descendants(db.folders, job.folderRoots, true);

      for (let i=0, id; id=ids[i], i < ids.length; i++) {
        docs[id] = await repo.saveAs('text', docs[id].toString());
      }

      let treeObj = {};
      for (let i=0, id; id=ids[i], i < ids.length; i++) {
        treeObj[id + '.json'] = { hash: docs[id], mode: modes.blob };
      }

      let foldersTree = await repo.saveAs('tree', treeObj);
      let componentsTree = await repo.saveAs('tree', {});
      let instancesTree = await repo.saveAs('tree', {});

      let jobBlob = await repo.saveAs('text', job.toString());

      job.hash = jobBlob;
      await db.jobs.put(job);

      let rootTree = await repo.saveAs('tree', {
        'folders': { mode: modes.tree, hash: foldersTree },
        'components': { mode: modes.tree, hash: componentsTree },
        'instances': { mode: modes.tree, hash: instancesTree },
        'job.json': { mode: modes.blob, hash: jobBlob }
      });

      let commit = await repo.saveAs('commit', {
        author: owner,
        tree: rootTree,
        message: 'first'
      });

      master = commit;
      await repo.updateRef('master', master);
    }

    let commit = await repo.loadAs('commit', master)

    //let handleTree = async(hash) => {
    //  let obj = await repo.loadAs('tree', hash);
    //  for (let name in obj) {
    //    let t = modes.toType(obj[name].mode);
    //    if (t === 'tree') {
    //      obj[name] = await handleTree(obj[name].hash);
    //    } else if (t === 'blob') {
    //      let text = await repo.loadAs('text', obj[name].hash);
    //      console.log('name', name, 'text', text);
    //      obj[name] = JSON.parse(text);
    //    }
    //  }
    //  return obj;
    //};

    let tree = await repo.loadAs('tree', commit.tree);
    console.log('tree', tree);

    let jobText = await repo.loadAs('text', tree['job.json'].hash);
    console.log('text', jobText);
    let jobId = JSON.parse(jobText).id;
    let job = await db.jobs.get(jobId);

    let firstFolderId = Object.keys(tree.folders)[0].slice(0, -5);
    await db.folders.update(firstFolderId, {
      description: 'some new description ' + Math.floor(Math.random() * 100),
      state: 1
    });

    await db.jobs.update(job.id, {
      description: 'new description ' + Math.floor(Math.random()*100),
      state: 1
    });

    let newFolder = await db.folders.where('name').startsWithIgnoreCase('test folder').first();
    if (!newFolder) {
      newFolder = new Folder(job.id, 'test folder ' + Math.floor(Math.random()*100), '', 'building', job.folders.roots[job.folders.order[0]]);
      newFolder.state = 1;
      await db.folders.add(newFolder);
    }

    this.checkStatus(job, repo);

    return this.status(job, repo, 'toast');
  }

  // compare the specified job to ref (if specified)
  async status(jobId, repo, ref?) {
    let db = this.db;
    let job;
    if (jobId instanceof Job) {
      job = jobId;
      jobId = job.id;
    } else if (typeof jobId === 'string') {
      job = await db.jobs.get(jobId);
    } else {
      throw new Error('invalid job type');
    }

    let commitHash = repo && await repo.readRef(ref || 'master');
    let commit = commitHash && await repo.loadAs('commit', commitHash);
    let tree = commit && await repo.loadAs('tree', commit.tree);

    let status:any = {};
    // job
    status.job = new Status(jobId, job && job.toJSON(), tree && JSON.parse((await repo.loadAs('text', tree['job.json'].hash)) || null));

    let { ids: inWorkingFolderTree } = await this.descendants(db.folders, job.folderRoots, true);

    // folders
    status.folders = await this.compare(
      jobId,
      repo,
      db.folders,
      tree && await repo.loadAs('tree', tree['folders'].hash),
      1,
      (obj) => inWorkingFolderTree.indexOf(obj.id) != -1
    );

    // instances
    status.instances = await this.compare(
      jobId,
      repo,
      db.instances,
      tree && await repo.loadAs('tree', tree['instances'].hash),
      1,
      (obj) => job.folders.order.every(n => inWorkingFolderTree.indexOf(obj.folders[n]) != -1)
    );

    // components
    let componentTree = tree && await repo.loadAs('tree', tree['components'].hash);
    status.components = await this.compare(
      jobId,
      repo,
      db.components,
      componentTree,
      1,
      (obj) => obj.parent || inWorkingFolderTree.indexOf(obj.folder) != -1
    );

    return status;
  }

  async compare(job: string, repo, table, tree, state: number, detachedFn?) {
    let q = { state, job };
    let staged = await table.where(q).toArray();
    let map = {};
    if (tree) {
      let hashes = staged.map(({ id }) => (tree[id+'.json'] || {}).hash).filter(h => h);
      (await repo.loadManyRaw(hashes)).forEach(({ hash, body }) => {
        let obj = JSON.parse(String.fromCharCode(...body));
        map[obj.id] = obj;
      });
    }
    return staged.map(current => new Status(job, current.toJSON(), map[current.id], detachedFn && detachedFn(current)));
  }

  async checkStatus(job:string|Job, repo, ref='master', fix=false) {
    let db = this.db;
    let jobId = typeof job === 'string' ? job : job.id;
    job = typeof job === 'string' ? await db.jobs.get(jobId) : job;

    let commitHash = await repo.readRef(ref);
    let commit = await repo.loadAs('commit', commitHash);
    let tree = await repo.loadAs('tree', commit.tree);

    // checking job...
    let head = tree['job.json'].hash;
    let working = calcHash(job.toString());

    console.log(head, working);
  }

  async descendants(table, rootId, includeRoot = false) {
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

  async createJob(name, description, type, owner, group) {
    let db = this.db;

    let job = Job.create({ name, description, type, owner, group });
    job.folders = { roots: {}, order: [] };
    
    if (type === 'job') {
      job.folders.order = ['phase', 'building'];
    }

    job.id = await db.jobs.add(job);

    // create root folders
    await Promise.all(job.folderRoots.map(async(type) => {
      let folder = new Folder(job.id, 'root', '', type, null);
      job.folders.roots[type] = folder.id = await db.folders.add(folder);
    }));

    return job;
  }
}
