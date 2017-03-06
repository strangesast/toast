import { NgModule, Optional, SkipSelf } from '@angular/core';

import { DataService } from '../data.service';

@NgModule({
  declarations: [],
  imports: [],
  providers: [
    DataService
  ],
  bootstrap: []
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule) {
    if (parentModule) {
      throw new Error('CoreModule is already loaded. Import it once in AppModule');
    }
  }
}
