import { Injectable } from '@angular/core';

import { modes, init } from './git';

@Injectable()
export class GitService {

  constructor() {}

  async init() {
    let repo = {};
    const name = 'testing';
    const version = 1;
    const prefix = 'test';

    await init(repo, name, version, prefix);

    return repo;
  }
}
