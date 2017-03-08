import { Injectable } from '@angular/core';
import { Resolve } from '@angular/router';
import * as deep from 'deep-diff';

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

      let rootFolders = await Promise.all(job.folders.order.concat('component').map(async(type) => {
        let folder = await db.folders.get({ name: 'root', type });
        if (!folder) {
          folder = Folder.create({
            name: 'root',
            type,
            job: job.id,
            state: 1
          });
          folder.id = await db.folders.add(folder);
          job.folders.roots[folder.type] = folder.id;
        }
        return folder;
      }));

      let foldersTree = await repo.saveAs('tree', (await Promise.all(rootFolders.map(async(folder) => {
        let blob = await repo.saveAs('text', folder.toString());
        folder.hash = blob;
        let tree = await repo.saveAs('tree', {
          [folder.id + '.json']: { mode: modes.blob, hash: blob }
        });

        return { name: folder.type, hash: tree, mode: modes.tree };

      }))));

      let componentsTree = await repo.saveAs('tree', {});
      let instancesTree = await repo.saveAs('tree', {});

      let jobBlob = await repo.saveAs('text', job.toString());

      job.state = 1;
      job.hash = jobBlob;
      await db.jobs.put(job);

      /*

      repo/
        folders/
          phase/
            { id, parent, name, ... }

          building/
            { id, parent, name, ... }

          component/
            { id, parent, name, ... }

        components/
          { id, folder, name, parent, ... }

        instances/
          { id, folders, name, ref, ... }

        job.json

      */

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

    job.description = 'new description ' + Math.floor(Math.random()*100);
    job.state = 0;

    await db.jobs.put(job);

    this.status(job.id, 'master');

    await new Promise((r) => setTimeout(r, 1000));

    job.state = 1;
    console.log('saving...');
    

    // read ref
    // get commit tree

    // 'git status'
    //   compare last commit to staging
    //     find: staging true, compare to head tree
    //     if present:
    //       compare hash of staged to head
    //       match:
    //         mark not staged
    //       not:
    //         mark as modified
    //     not in head:
    //       mark as added
    //     not in staging:
    //       mark as removed
    //
    //   compare staging to work area

    // "working tree"

    return repo;
  }

  // compare stage to head (ref)
  async status(jobId, ref) {
    let db = this.db;
    let repo = this.repo;

    let job = await db.jobs.get(jobId);

    let folderTypes = job.folders.order.concat('component')

    let hash = await repo.readRef('master')
    let commit = hash && await repo.loadAs('commit', hash);
    let root = commit && await repo.loadAs('tree', commit.tree);
    let dir = root && await repo.loadAs('tree', root.folders.hash);

    folderTypes.map(async(type) => {
      let rootId = job.folders.roots[type];

      let head = await repo.loadAs('tree', dir[type].hash);
      // remove .json
      let headIds = Object.keys(head).map(k => k.slice(0, -5)).sort(comparer);

      let { ids, docs: folders } = await this.descendants(db.folders, rootId, true);

      // staged but not present in head (could be moved to end)
      let unattached = await db.folders.where({ type, job: job.id, state: 1 }).filter(f => ids.indexOf(f.id) == -1).toArray();

      ids.sort(comparer);
      console.log('here', headIds, ids, unattached);

    });


    /*

    // should use job.shortname for prefix
    let commitHash = await repo.readRef('master');

    if (commitHash) {
      let commit = await repo.loadAs('commit', commitHash);

      let tree = await repo.loadAs('tree', commit.tree);

      let folders = await repo.loadAs('tree', tree.folders.hash);

      await Promise.all(job.folders.order.concat('component').map(async(type) => {
        let id = job.folders.roots[type];

        let l = await this.getDescendants(db.folders, id);

        let obj = (await repo.loadAs('tree', folders[type].hash));

        let ids = Object.keys(obj).filter(k => obj[k].mode === modes.blob).map(k => k.slice(0, -5)).sort(comparer)

        console.log('ids1', l.map(k => k.id));
        console.log('ids2', ids);

      }));

    } else {

    }
    */

    // load head

    
    // load stagin


    let folders = await db.folders.where({ job: job.id }).toArray();

  }

  async descendants(table, rootId, includeRoot = false) {
    let ids, queue, docs = {};
    ids = queue = [rootId];
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

}
