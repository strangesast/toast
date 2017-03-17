import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { CoreModule } from './modules/core.module';

import { GitService } from './git.service';
import { OAuthService } from './oauth.service';
import { ObjectService } from './object.service';

import { AppComponent } from './app.component';
import { OAuthComponent } from './oauth/oauth.component';
import { MainComponent } from './main/main.component';
import { ListComponent } from './list/list.component';

const routes: Routes = [
  { path: '',
    component: MainComponent,
    resolve: { git: GitService, object: ObjectService },
    children: [
      { path: 'list',
        component: ListComponent
      }
    ]
  },
  { path: 'oauth', component: OAuthComponent }
];

@NgModule({
  declarations: [
    AppComponent,
    OAuthComponent,
    MainComponent,
    ListComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpModule,
    CoreModule,
    RouterModule.forRoot(routes)
  ],
  providers: [
    OAuthService,
    GitService,
    ObjectService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
