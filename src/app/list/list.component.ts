import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GitService } from '../git.service';
import { DataService } from '../data.service';
import { getHash } from '../git';
import * as deep from 'deep-diff';

import { Collection, ComponentElement, InstanceElement, FolderElement } from '../models';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.css']
})
export class ListComponent implements OnInit {
  public newJobName: string = '';
  public newFolderName: string = '';
  public newComponentName: string = '';
  public newInstanceName: string = '';

  constructor(private db: DataService, private git: GitService, private route: ActivatedRoute ) { }

  ngOnInit() {}

  async createJob(name?: string, type='job') {
    let db = this.db;
    name = name || `Some Job #${ Math.floor(Math.random()*100)}`;

    let job = new Collection(name);

    let key = await db.save(job);

    console.log('saved', await db.collections.get(key));
  }

  createFolder(name?: string) {
    let db = this.db;
    name = name || `Some Folder #${ Math.floor(Math.random()*100)}`;
  }

  createComponent(name?: string) {
    let db = this.db;
    name = name || `Some Component #${ Math.floor(Math.random()*100)}`;
  }

  createInstance(name?: string) {
    let db = this.db;
    name = name || `Some Instance #${ Math.floor(Math.random()*100)}`;
  }
}
