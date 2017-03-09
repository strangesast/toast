import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import * as deep from 'deep-diff';

import { Observable } from 'rxjs';

import { DataService } from './data.service';

import { User, Group, Job, Folder, Instance, Component } from './models';
import { modes, init, Repo, Commit } from './git';
import { startsWith } from './indexeddb';
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

    let repo = this.repo = <Repo>{};

    // repo, name, version, prefix
    let prefix = 'toast';
    let gitdb = this.gitdb = await init(repo, 'test', 1, prefix);
    let db = this.db;

    //let store = gitdb.transaction(['refs'], 'readonly').objectStore('refs');
    //let refs = (await startsWith(store, prefix)).map(({ hash }) => hash);


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

    let handleTree = async(hash) => {
      let obj = await repo.loadAs('tree', hash);
      for (let name in obj) {
        let t = modes.toType(obj[name].mode);
        if (t === 'tree') {
          obj[name] = await handleTree(obj[name].hash);
        } else if (t === 'blob') {
          obj[name] = JSON.parse(await repo.loadAs('text', obj[name].hash));
        }
      }
      return obj;
    };

    let tree = await handleTree(commit.tree);

    let job = await db.jobs.get(tree['job.json'].id);

    let firstFolderId = Object.keys(tree.folders)[0].slice(0, -5);
    await db.folders.update(firstFolderId, {
      description: 'some new description ' + Math.floor(Math.random() * 100),
      state: 1
    });

    await db.jobs.update(job.id, {
      description: 'new description ' + Math.floor(Math.random()*100),
      state: 1
    });

    this.status(job, 'master', true);

    await new Promise((r) => setTimeout(r, 1000));

    job.state = 1;
    console.log('saving...');

    return repo;
  }

  async status(jobId, ref, diff=false) {
    let db = this.db;
    let repo = this.repo;
    let job = typeof jobId === 'string' ? (await db.jobs.get(jobId)) : jobId;
    if (!job || !(job instanceof Job)) {
      throw new Error('job with that id has not been loaded');
    }

    let commitHash = await repo.readRef(ref);
    if (!commitHash) {
      throw new Error(`that ref does not exist ("${ref}")`);
    }
    let commit = await repo.loadAs('commit', commitHash);

    let rootTree = await repo.loadAs('tree', commit.tree);

    let { ids: inFolderTree } = await this.descendants(db.folders, job.folderRoots, true);
    let staged = await this.stageStatus(job);

    console.log(await this.compare(repo, rootTree, inFolderTree, job.folders.order, staged, diff));
    console.log(await this.compare(repo, rootTree, inFolderTree, job.folders.order, await this.workStatus(job), diff));

  }

  async compare(repo, rootTree, inFolderTree, jobFolders, stage, diff = false) {
    let ret = {};
    for (let prop in stage) {
      let fn, val;
      if (prop == 'folders') {
        fn = (el) => inFolderTree.indexOf(el['id']) != -1

      }
      if (prop == 'components') {
        fn = (el) => el['parent'] || inFolderTree.indexOf(el['folder']) != -1
      }
      if (prop == 'instances') {
        fn = (el) => jobFolders.every(n => inFolderTree.indexOf(el.folders[n]) != -1)
      }
      if (prop == 'folders' || prop == 'components' || prop == 'instances') {
        let tree = await repo.loadAs('tree', rootTree[prop].hash);
        let ids = Object.keys(tree)
          .filter(name => tree[name].mode === modes.blob)
          .map(name => name.slice(0, -5));

        await Promise.all(ids.map(async(id) => tree[id + '.json'].val = JSON.parse(await repo.loadAs('text', tree[id + '.json'].hash))));
        val = { created: [], modified: [], detached: [] };
        stage[prop].forEach((el) =>
          (fn(el) ? (ids.indexOf(el.id) != -1 ? val.modified : val.created) : val.detached).push((diff && ids.indexOf(el.id) != -1) ? deep.diff(tree[el.id + '.json'].val, el.toJSON()) : el), 
        );
      }
      if (prop == 'job') {
        val = stage[prop];
      }
      ret[prop] = val;
    }
    return ret;
  }

  async stageStatus(jobId) {
    // job
    let db = this.db;
    let job = typeof jobId === 'string' ? (await db.jobs.get(jobId)) : jobId;
    if (!job || !(job instanceof Job)) throw new Error('job with that id has not been loaded');
    let q = { state: 1, job: job.id };
    let names = ['folders', 'components', 'instances'];
    let ret: any = {};
    ret.job = job.state == 1 && job;
    await Promise.all(names.map(async(n) => ret[n] = await db[n].where(q).toArray()))
    return ret;
  }

  async workStatus(jobId) {
    // job
    let db = this.db;
    let job = typeof jobId === 'string' ? (await db.jobs.get(jobId)) : jobId;
    if (!job || !(job instanceof Job)) throw new Error('job with that id has not been loaded');
    let q = { state: 0, job: job.id };
    let names = ['folders', 'components', 'instances'];
    let ret: any = {};
    ret.job = job.state == 0 && job;
    await Promise.all(names.map(async(n) => ret[n] = await db[n].where(q).toArray()))
    return ret;
  }

  async descendants(table, rootId, includeRoot = false) {
    let ids, queue, docs = {};
    if (Array.isArray(rootId)) {
      ids = queue = rootId;
    } else if (typeof rootId === 'string') {
      ids = queue = [rootId];
    } else {
      throw new Error('invalid rootId type');
    }

    if (includeRoot) {
      await Promise.all(queue.map(async(id) => docs[id] = await table.get(id)));
    }

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
