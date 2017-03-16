import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import * as deep from 'deep-diff';

import { Observable } from 'rxjs';

import { DataService } from './data.service';

import { User, Group, Collection, FolderElement, InstanceElement, ComponentElement } from './models';
import { calcHash, modes, init, Repo, Commit } from './git';
import { startsWith } from './indexeddb';

class Status {
  constructor(public id: string, public current: any, public previous?: any, public detached?: boolean) {}

  get diff() { return deep.diff(this.previous, this.current); } 
  get status() {
    return (this.current && this.previous) ? (this.diff ? 'modified' : 'same') : !this.previous ? 'created' : 'deleted';
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

  dbName = 'testing';
  dbVersion = 1;

  constructor(private db: DataService) {}

  resolve() {
    //return this.init();
  }

  async init(prefix) {
    return init(prefix, this.dbName, this.dbVersion);
    /*
    // repo, name, version, prefix
    let prefix = 'toast';
    let repo = await init(prefix, 'test', 1);
    let db = this.db;

    let master = await repo.readRef('master');

    if (!master) {
      let owner = await db.users.get({ username: 'test_test' });
      if (!owner) {
        owner = new User('test_test', 'Test Test', 'test@example.com');
        await db.users.add(owner);
      }

      let group = await db.groups.get({ shortname: 'testg' });
      if (!group) {
        group = new Group('testg', 'Test Group');
        await db.groups.add(group);

        if (owner.groups.indexOf(group.shortname) == -1) {
          owner.groups.push(group.shortname);
        }
      }

      let job = await db.collections.get({ shortname: 'test_job' });
      if (!job) {
        job = new Collection('Test Job', 'test_job', 'a test job for testing', 'job', owner.username);
        await job.init(db.collections, db.folders);
      }

    }

    let commit = await repo.loadAs('commit', master)

    let tree = await repo.loadAs('tree', commit.tree);
    console.log('tree', tree);

    let jobText = await repo.loadAs('text', tree['job.json'].hash);
    console.log('text', JSON.parse(jobText));
    let jobId = JSON.parse(jobText).id;
    let job = await db.collections.get(jobId);

    let firstFolderId = Object.keys(tree.folders)[0].slice(0, -5);
    await db.folders.update(firstFolderId, {
      description: 'some new description ' + Math.floor(Math.random() * 100),
      state: 1
    });

    await db.collections.update(job.id, {
      description: 'new description ' + Math.floor(Math.random()*100),
      state: 1
    });

    let newFolder = await db.folders.where('name').startsWithIgnoreCase('test folder').first();
    if (!newFolder) {
      newFolder = new FolderElement(job.id, 'test folder ' + Math.floor(Math.random()*100), '', 'building', job.folders.roots[job.folders.order[0]]);
      newFolder.state = 1;
      await db.folders.add(newFolder);
    }

    this.checkStatus(job, repo);

    return this.jobStatus(job, repo, 'toast');
    */
  }

  async status() {
    let db = this.db;
    let repo = this.repo;
  }

  // compare the specified job to ref (if specified)
  async jobStatus(job, repo, ref?) {
    let db = this.db;
    job = job instanceof Collection ? job : await db.collections.get(job);
    if (!job) {
      throw new Error('invalid / nonexistant job');
    }

    let commitHash = repo && await repo.readRef(ref || 'master');
    let commit = commitHash && await repo.loadAs('commit', commitHash);
    let tree = commit && await repo.loadAs('tree', commit.tree);

    let status:any = {};
    // job
    status.job = new Status(job.id, job && job.toJSON(), tree && JSON.parse((await repo.loadAs('text', tree['job.json'].hash)) || null));

    let { ids: inWorkingFolderTree } = await this.descendants(db.folders, job.folderRoots, true);

    // folders
    status.folders = await this.compare(
      job.id,
      repo,
      db.folders,
      tree && await repo.loadAs('tree', tree['folders'].hash),
      1,
      (obj) => inWorkingFolderTree.indexOf(obj.id) != -1
    );

    // instances
    status.instances = await this.compare(
      job.id,
      repo,
      db.instances,
      tree && await repo.loadAs('tree', tree['instances'].hash),
      1,
      (obj) => job.folders.order.every(n => inWorkingFolderTree.indexOf(obj.folders[n]) != -1)
    );

    // components
    let componentTree = tree && await repo.loadAs('tree', tree['components'].hash);
    status.components = await this.compare(
      job.id,
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

  async initRepo(job: string|Collection) {
    let db = this.db;
    let repo = this.repo;
    job = <Collection>(job instanceof Collection ? job : await db.collections.get(job));
    if (!job) {
      throw new Error('invalid / nonexistant job');
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
    await db.collections.put(job);

    let rootTree = await repo.saveAs('tree', {
      'folders':    { mode: modes.tree, hash: foldersTree },
      'components': { mode: modes.tree, hash: componentsTree },
      'instances':  { mode: modes.tree, hash: instancesTree },
      'job.json':   { mode: modes.blob, hash: jobBlob }
    });

    let owner = await db.users.get(job.owner);

    let commit = await repo.saveAs('commit', {
      author: owner,
      tree: rootTree,
      message: 'first'
    });

    await repo.updateRef('master', commit);
    return commit;
  }

  async checkStatus(job:string|Collection, repo, ref='master', fix=false) {
    let db = this.db;
    job = job instanceof Collection ? job : await db.collections.get(job);

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

  async readTree(repo, hash) {
    let obj = await repo.loadAs('tree', hash);
    for (let name in obj) {
      let t = modes.toType(obj[name].mode);
      if (t === 'tree') {
        obj[name] = await this.readTree(repo, obj[name].hash);
      } else if (t === 'blob') {
        let text = await repo.loadAs('text', obj[name].hash);
        console.log('name', name, 'text', text);
        obj[name] = JSON.parse(text);
      }
    }
    return obj;
  };


  async unload() {
    // apply commit date to all modified
  }
}
