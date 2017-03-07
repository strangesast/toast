import { Injectable } from '@angular/core';
import * as deep from 'deep-diff';

import { DataService } from './data.service';

import { modes, init, Repo } from './git';

const BODY = {
  key: 'value value value'
};

@Injectable()
export class GitService {

  constructor(private db: DataService) {}

  async init() {
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
}
