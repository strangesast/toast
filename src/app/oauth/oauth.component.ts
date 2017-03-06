import { Component, OnInit } from '@angular/core';
import { URLSearchParams } from '@angular/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-oauth',
  template: `<p>Processing oauth</p>`,
  styleUrls: []
})
export class OAuthComponent implements OnInit {

  constructor(private router: Router) { }

  ngOnInit() {
    if (window.opener) {
      let search = location.search;
      if (search.startsWith('?')) {
        let params = new URLSearchParams(search.slice(1));
        let message = {};
        for(let [key, value] of params.paramsMap) {
          message[key] = decodeURIComponent(value[0]);
        }
        let origin = window.location.origin
        return window.opener.postMessage(message, origin);
      }
    }
    this.router.navigateByUrl('/');
  }

}
