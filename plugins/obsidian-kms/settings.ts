import { App, PluginSettingTab, Setting } from 'obsidian';
import KmsPlugin from './main';

/** Plugin settings shape. */
export interface KmsSettings {
  /** Base URL of the KMS API, e.g. http://localhost:3000 */
  apiUrl: string;
  /** JWT access token for authentication */
  jwtToken: string;
  /** Folder to save "Ask KMS" responses (relative to vault root, e.g. "KMS Responses") */
  responseFolder: string;
}

export const DEFAULT_SETTINGS: KmsSettings = {
  apiUrl: 'http://localhost:3000',
  jwtToken: '',
  responseFolder: 'KMS Responses',
};

/** Settings tab rendered in Obsidian's plugin settings panel. */
export class KmsSettingTab extends PluginSettingTab {
  plugin: KmsPlugin;

  constructor(app: App, plugin: KmsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'KMS Integration Settings' });

    new Setting(containerEl)
      .setName('KMS API URL')
      .setDesc('Base URL of your KMS API server (no trailing slash)')
      .addText(text => text
        .setPlaceholder('http://localhost:3000')
        .setValue(this.plugin.settings.apiUrl)
        .onChange(async (value) => {
          this.plugin.settings.apiUrl = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('JWT Token')
      .setDesc('Your KMS API access token')
      .addText(text => {
        text
          .setPlaceholder('eyJhbGciOiJIUzI1NiIs...')
          .setValue(this.plugin.settings.jwtToken)
          .onChange(async (value) => {
            this.plugin.settings.jwtToken = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
      });

    new Setting(containerEl)
      .setName('Response folder')
      .setDesc('Folder where "Ask KMS" responses are saved as notes')
      .addText(text => text
        .setPlaceholder('KMS Responses')
        .setValue(this.plugin.settings.responseFolder)
        .onChange(async (value) => {
          this.plugin.settings.responseFolder = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}
