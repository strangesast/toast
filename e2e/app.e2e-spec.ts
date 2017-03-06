import { ToastPage } from './app.po';

describe('toast App', () => {
  let page: ToastPage;

  beforeEach(() => {
    page = new ToastPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
