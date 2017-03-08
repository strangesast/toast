import { Injectable } from '@angular/core';

import Dexie from 'dexie';
import 'dexie-observable';

import { User, Group, Folder, Instance, Component, Job } from './models';

@Injectable()
export class DataService extends Dexie {

  jobs: Dexie.Table<Job, string>;
  instances: Dexie.Table<Instance, string>;
  components: Dexie.Table<Component, string>;
  folders: Dexie.Table<Folder, string>;
  users: Dexie.Table<User, string>;
  groups: Dexie.Table<Group, string>;

  constructor() {
    super('testing');

    // indecies
    this.version(1).stores({
      jobs: '$$id, &shortname, name, owner, group',
      components: '$$id, parent, job, name, [job+state]',
      instances: '$$id, ref, job, name, folders, [job+state]',
      folders: '$$id, parent, job, name, type, [name+type], [job+state], [job+type+state]',
      users: '&username, name, email',
      groups: '&shortname'
    });

    this.jobs.mapToClass(Job);
    this.components.mapToClass(Component);
    this.instances.mapToClass(Instance);
    this.folders.mapToClass(Folder);
    this.users.mapToClass(User);
    this.groups.mapToClass(Group);
  }
}
