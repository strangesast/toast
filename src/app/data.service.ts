import { Injectable } from '@angular/core';

import Dexie from 'dexie';
import 'dexie-observable';

import { getHash } from './git';

import { User, Group, FolderElement, InstanceElement, ComponentElement, Collection } from './models';

@Injectable()
export class DataService extends Dexie {

  collections: Dexie.Table<Collection, string>;
  instances: Dexie.Table<InstanceElement, string>;
  components: Dexie.Table<ComponentElement, string>;
  folders: Dexie.Table<FolderElement, string>;
  users: Dexie.Table<User, string>;
  groups: Dexie.Table<Group, string>;

  constructor() {
    super('testing');

    // indecies
    this.version(1).stores({
      collections: '[hash+id], hash, id, [id+priority], modified, name,      state,       &shortname, owner, group',
      components:  '[hash+id], hash, id, [id+priority], modified, name, job, [job+state], parent, folder',
      folders:     '[hash+id], hash, id, [id+priority], modified, name, job, [job+state], parent, type',
      instances:   '[hash+id], hash, id, [id+priority], modified, name, job, [job+state], folders.building, folders.phase, [folders.building+folders.phase]',
      users: '&username, name, email, modified',
      groups: '&shortname, modified'
    });

    this.collections.mapToClass(Collection);
    this.components.mapToClass(ComponentElement);
    this.instances.mapToClass(InstanceElement);
    this.folders.mapToClass(FolderElement);
    this.users.mapToClass(User);
    this.groups.mapToClass(Group);
  }

  generateId() {
    return Dexie.Observable.createUUID();
  }

  async save(obj, historyLedger?, ignoreValidation=false) {
    let table: Dexie.Table<any, string> =
      obj instanceof Collection ? this.collections :
      obj instanceof ComponentElement ? this.components :
      obj instanceof FolderElement ? this.folders :
      obj instanceof InstanceElement ? this.instances :
      obj instanceof User ? this.users :
      obj instanceof Group ? this.groups :
      null;

    if (!table) {
      throw new Error('cannot save that object');
    }

    let date = new Date();

    if (!obj.id) {
      obj.id = this.generateId();
      obj.created = date;
    }

    obj.modified = date;
    obj.hash = getHash(obj.toString());

    let previous = await table.get(obj.pk);

    if (!obj.valid && !ignoreValidation) {
      throw new Error('saving invalid object');
    }

    let key = await table.put(obj);

    if (historyLedger) {
      historyLedger.add(key, previous);
    }

    return key;
  }
}
