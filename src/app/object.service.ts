import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { GitService } from './git.service';
import { Collection } from './models';

import { Repo } from './git';

@Injectable()
export class ObjectService {
  currentJob: BehaviorSubject<Collection>;
  repo: Repo;

  constructor(private git: GitService) { }

  async initializeJob(job) {
    let currentJob = this.currentJob && this.currentJob.getValue();
    if (currentJob != null) {
      // need to check that stage is clean
      return
    }

    let prefix = job.shortname;

    let repo = this.git.init(prefix);

    // load/create repo
    // read repo objects

  }

  async processRef(repo: Repo, ref) {
    let commitHash = await repo.readRef(ref);

    let commit = await repo.loadAs('commit', commitHash);

    commit
  }
}
