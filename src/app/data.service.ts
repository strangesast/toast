import { Injectable } from '@angular/core';

import Dexie from 'dexie';
import 'dexie-observable';

import { Folder, Doc } from './models';

@Injectable()
export class DataService extends Dexie {

  docs: Dexie.Table<Doc, string>;
  folders: Dexie.Table<Folder, string>;

  constructor() {
    super('testing');

    this.version(1).stores({
      docs: '$$id, parent',
      folders: '$$id, parent'
    });

    this.docs.mapToClass(Doc);
    this.folders.mapToClass(Folder);
  }
}
