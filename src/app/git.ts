import * as _modes       from 'js-git/lib/modes';
import * as indexedDB    from 'js-git/mixins/indexed-db';
import * as memDB        from 'js-git/mixins/mem-db';
import * as createTree   from 'js-git/mixins/create-tree';
import * as packOps      from 'js-git/mixins/pack-ops';
import * as walkers      from 'js-git/mixins/walkers';
import * as readCombiner from 'js-git/mixins/read-combiner';
import * as formats      from 'js-git/mixins/formats';

export const modes = _modes;

export async function init(repo: any, name, version, prefix) {
  let db = await indexedDB.init(name, version);
  indexedDB(repo, prefix);
  createTree(repo);
  packOps(repo);
  walkers(repo);
  readCombiner(repo);
  formats(repo);
  return db;
}
