import { Component, Renderer } from '@angular/core';
import { Http, RequestOptions, Headers } from '@angular/http';

import { BehaviorSubject, Observable } from 'rxjs';

import { GitService } from './git.service';
import { OAuthService } from './oauth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  authorized = new BehaviorSubject(false);
  options: RequestOptions;

  constructor(private renderer: Renderer, private git: GitService, private oauth: OAuthService, private http: Http) {}

  async ngOnInit() {
    this.git.init();

    this.check();
  }

  async authorize() {
    let token = await this.oauth.authorize(this.renderer);
    console.log('token', token);

    if (!token) {
      return this.authorized.next(false);
    }
    this.authorized.next(true);

    let test = await this.check(token);
    if(!test) {
      throw new Error('invalid token');
    }


  }

  async check(token?) {
    token = token || localStorage.getItem('token');
    if (!token) {
      return false;
    }
    this.options = new RequestOptions({ headers: new Headers({ 'Authorization': `token ${ token }` }) });
    let request;
    try {
      request = await this.http.get('https://api.github.com/user', this.options).toPromise();
      if (request.status < 400) {
        localStorage.setItem('token', token);
        this.authorized.next(true);
        return true;
      }
    } catch (e) {
    } finally {
      localStorage.removeItem('token');
      return false;
    }
  }
}
