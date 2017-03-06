import { Injectable, Renderer } from '@angular/core';
import { URLSearchParams, Http, Headers, RequestOptions } from '@angular/http';
import { Observable } from 'rxjs';

const GITHUB_ID = 'c4452ebb19a1053a518d';
const GITHUB_SECRET = '3163b6e37735afd7e8adf7ffb4980c8ff5d29760';

@Injectable()
export class OAuthService {

  constructor(private http: Http) { }

  async authorize(renderer: Renderer) {
    const windowParams = 'toolbar=no,dependent=yes,height=600,width=600';
    const authURL = 'https://github.com/login/oauth/authorize';
    let scopes = ['user', 'repo'];

    let authParams = new URLSearchParams();
    authParams.set('client_id', GITHUB_ID);
    authParams.set('redirect_uri', `${ window.location.origin }/oauth`);
    authParams.set('scope', scopes.join(' '));

    let url = authURL + '?' + authParams.toString();

    let { state, code }: any = await new Promise((resolve, reject) => {
      let ref = window.open(url, 'Login', windowParams);
      let done = renderer.listenGlobal('window', 'message', (evt) => {
        if (evt.source == ref) {
          ref.close();
          done();
          resolve(evt.data);
        }
      });
    });


    let tokenURL = `/gh/login/oauth/access_token`;

    let headers = new Headers({ 'Accept': 'application/json' });

    let options = new RequestOptions({ headers });

    let search = new URLSearchParams();
    search.set('client_id', GITHUB_ID)
    search.set('client_secret', GITHUB_SECRET);
    search.set('code', code);

    let response = await this.http
      .post(tokenURL, search, options)
      .map(response => response.json())
      .toPromise();

    if (response.error) {
      return null;
    }

    let { access_token: accessToken } = response;

    return accessToken;
  }
}
