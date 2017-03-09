import * as _modes       from 'js-git/lib/modes';
import * as indexedDB    from 'js-git/mixins/indexed-db';
import * as memDB        from 'js-git/mixins/mem-db';
import * as createTree   from 'js-git/mixins/create-tree';
import * as packOps      from 'js-git/mixins/pack-ops';
import * as walkers      from 'js-git/mixins/walkers';
import * as readCombiner from 'js-git/mixins/read-combiner';
import * as formats      from 'js-git/mixins/formats';

interface Modes {
  isBlob: (mode: string) => boolean;
  isFile: (mode: string) => boolean;
  toType: (mode: string) => string;
  tree: number;
  blob: number;
  file: number;
  exec: number;
  sym: number;
  commit: number;
}

interface Author {
  date: Date;
  email: string;
  name: string;
}

export interface Commit {
  tree: string;
  author: Author;
  committer: Author;
  parents: string[];
  message: string;
}

export const modes: Modes = _modes;

export interface Repo {
  refPrefix: string;
  saveAs(type: string, body: any, callback?: (err: any, hash: string, body: any) => any, forcedHash?: string): Promise<string>;
  loadAs(type: string, hash: string): Promise<any>;
  loadRaw(hash: string): Promise<any>;
  loadManyRaw(hashes: string[]): Promise<any>;
  readRef(ref: string): Promise<string>;
  updateRef(ref: string, hash: string, callback?: () => any): Promise<void>;
  hasHash(): Promise<boolean>;
  createTree(): Promise<any>;
  logWalk(): Promise<any>;
  pack(): Promise<any>;
}

export async function init(repo: Repo, name, version, prefix): Promise<IDBDatabase> {
  let db = await indexedDB.init(name, version);
  indexedDB(repo, prefix);
  createTree(repo);
  packOps(repo);
  walkers(repo);
  //readCombiner(repo); TODO: move this over to promises
  formats(repo);
  return db;
}
