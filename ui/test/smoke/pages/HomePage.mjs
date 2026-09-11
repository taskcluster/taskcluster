import { BasePage } from './BasePage.mjs';

export class HomePage extends BasePage {
  get drawerToggle() {
    return this.page.locator('#toggle-drawer');
  }

  async open() {
    return this.navigate('/');
  }

  async openDrawer() {
    await this.drawerToggle.waitFor({ state: 'visible', timeout: 15000 });
    await this.drawerToggle.click();
  }

  drawerItem(label) {
    return this.page.getByText(label, { exact: true }).first();
  }
}
