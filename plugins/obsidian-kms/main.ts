import { App, MarkdownView, Modal, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { KmsSettings, DEFAULT_SETTINGS, KmsSettingTab } from './settings';

/** Main plugin class. Registered as the plugin entry point. */
export default class KmsPlugin extends Plugin {
  settings: KmsSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new KmsSettingTab(this.app, this));

    // Command 1: Send current note to KMS for indexing
    this.addCommand({
      id: 'send-to-kms',
      name: 'Send current note to KMS',
      checkCallback: (checking: boolean) => {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          if (!checking) {
            this.sendNoteToKms(markdownView);
          }
          return true;
        }
        return false;
      },
    });

    // Command 2: Open the Ask KMS modal
    this.addCommand({
      id: 'ask-kms',
      name: 'Ask KMS',
      callback: () => {
        new AskKmsModal(this.app, this).open();
      },
    });
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Validates that the required plugin settings are configured.
   * Shows a Notice and returns false when settings are missing.
   */
  public validateSettings(): boolean {
    if (!this.settings.apiUrl || !this.settings.jwtToken) {
      new Notice('KMS: Please configure the API URL and JWT token in plugin settings.');
      return false;
    }
    return true;
  }

  /**
   * Sends the currently open note to the KMS `/files/ingest` endpoint.
   * Shows a Notice with the result or error.
   *
   * @param view - The active MarkdownView containing the note to ingest.
   */
  async sendNoteToKms(view: MarkdownView): Promise<void> {
    if (!this.validateSettings()) return;

    const file = view.file;
    if (!file) {
      new Notice('KMS: No file is open.');
      return;
    }

    const content = await this.app.vault.read(file);
    const title = file.basename;
    const path = file.path;

    new Notice(`KMS: Sending "${title}" to KMS...`);

    try {
      const response = await fetch(`${this.settings.apiUrl}/files/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.jwtToken}`,
        },
        body: JSON.stringify({ title, content, path }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }

      const result = await response.json() as { fileId: string; sourceId: string };
      new Notice(`KMS: Note queued for indexing (file ID: ${result.fileId.slice(0, 8)}...)`);
    } catch (err) {
      console.error('KMS sendNoteToKms error:', err);
      new Notice(`KMS Error: ${(err as Error).message}`);
    }
  }

  /**
   * Queries the KMS via an ACP session and streams back the response.
   *
   * Flow:
   *  1. POST /acp/v1/sessions — create session
   *  2. POST /acp/v1/sessions/{id}/prompt — stream SSE response
   *  3. DELETE /acp/v1/sessions/{id} — close session (always)
   *
   * @param query    - The user's question.
   * @param onChunk  - Callback invoked with each text chunk as it arrives.
   * @returns The full accumulated response text.
   */
  async queryKms(query: string, onChunk: (text: string) => void): Promise<string> {
    const { apiUrl, jwtToken } = this.settings;
    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwtToken}`,
    };

    // Step 1: Create ACP session
    const sessionResp = await fetch(`${apiUrl}/acp/v1/sessions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ agent: 'claude-api' }),
    });

    if (!sessionResp.ok) {
      throw new Error(`Failed to create KMS session: HTTP ${sessionResp.status}`);
    }

    const { sessionId } = await sessionResp.json() as { sessionId: string };

    try {
      // Step 2: Stream prompt via SSE
      const promptResp = await fetch(`${apiUrl}/acp/v1/sessions/${sessionId}/prompt`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ message: query, tools: ['kms_search'] }),
      });

      if (!promptResp.ok || !promptResp.body) {
        throw new Error(`Failed to start KMS prompt: HTTP ${promptResp.status}`);
      }

      let fullText = '';
      const reader = promptResp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const event = JSON.parse(jsonStr) as { type: string; data: unknown };

            if (event.type === 'agent_message_chunk') {
              const text = (event.data as { text?: string }).text ?? '';
              fullText += text;
              onChunk(text);
            } else if (event.type === 'done') {
              return fullText;
            } else if (event.type === 'error') {
              throw new Error(
                (event.data as { message?: string }).message ?? 'KMS stream error',
              );
            }
          } catch (parseErr) {
            // Ignore malformed SSE lines — the server may emit keep-alive comments
          }
        }
      }

      return fullText;
    } finally {
      // Step 3: Always close the session, even on error
      try {
        await fetch(`${apiUrl}/acp/v1/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
      } catch {
        // Ignore session-close errors — best-effort cleanup
      }
    }
  }

  /**
   * Saves a KMS query response as a new markdown note in the vault.
   *
   * Creates the configured response folder if it does not yet exist.
   * The filename follows the pattern: `KMS - {query} - {timestamp}.md`
   *
   * @param query   - The original query (used in the filename and document title).
   * @param content - The markdown response body to save.
   * @returns The newly created TFile.
   */
  async saveResponseAsNote(query: string, content: string): Promise<TFile> {
    const folderPath = normalizePath(this.settings.responseFolder);

    // Create the response folder if it does not exist
    if (!this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }

    // Build a filesystem-safe filename capped at 40 chars of the query
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
    const safeQuery = query.slice(0, 40).replace(/[\\/:*?"<>|]/g, ' ').trim();
    const filename = normalizePath(`${folderPath}/KMS - ${safeQuery} - ${timestamp}.md`);

    const noteContent = [
      `# KMS: ${query}`,
      '',
      `*Generated at ${new Date().toLocaleString()}*`,
      '',
      '---',
      '',
      content,
    ].join('\n');

    return this.app.vault.create(filename, noteContent);
  }
}

/** Modal that prompts the user for a query and streams the KMS response live. */
class AskKmsModal extends Modal {
  private plugin: KmsPlugin;
  private queryInput!: HTMLInputElement;
  private resultEl!: HTMLDivElement;
  private submitBtn!: HTMLButtonElement;
  private isLoading = false;

  constructor(app: App, plugin: KmsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Ask KMS' });

    const form = contentEl.createEl('div', { cls: 'kms-form' });

    this.queryInput = form.createEl('input', {
      placeholder: 'What do you want to know?',
      cls: 'kms-query-input',
    });
    // @ts-ignore — createEl typing does not expose every HTML attribute
    this.queryInput.type = 'text';
    this.queryInput.style.cssText =
      'width:100%;margin-bottom:12px;padding:8px;font-size:14px;box-sizing:border-box;';

    this.submitBtn = form.createEl('button', { text: 'Ask', cls: 'mod-cta' });
    this.submitBtn.style.marginBottom = '16px';
    this.submitBtn.addEventListener('click', () => this.handleSubmit());

    this.queryInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !this.isLoading) this.handleSubmit();
    });

    this.resultEl = contentEl.createEl('div', { cls: 'kms-result' });
    this.resultEl.style.cssText = [
      'display:none',
      'max-height:300px',
      'overflow-y:auto',
      'padding:8px',
      'border:1px solid var(--background-modifier-border)',
      'border-radius:4px',
      'font-family:var(--font-monospace)',
      'font-size:13px',
      'white-space:pre-wrap',
    ].join(';');

    // Focus the query input after the modal finishes rendering
    setTimeout(() => this.queryInput.focus(), 50);
  }

  private async handleSubmit(): Promise<void> {
    if (this.isLoading) return;
    if (!this.plugin.validateSettings()) return;

    const query = this.queryInput.value.trim();
    if (!query) {
      new Notice('KMS: Please enter a query.');
      return;
    }

    this.isLoading = true;
    this.submitBtn.disabled = true;
    this.submitBtn.setText('Asking...');
    this.resultEl.style.display = 'block';
    this.resultEl.textContent = '';

    try {
      const fullText = await this.plugin.queryKms(query, (chunk) => {
        this.resultEl.textContent += chunk;
        // Auto-scroll to the latest chunk
        this.resultEl.scrollTop = this.resultEl.scrollHeight;
      });

      // Persist the full response as a vault note
      const noteFile = await this.plugin.saveResponseAsNote(query, fullText);

      new Notice(`KMS: Response saved to "${noteFile.path}"`);
      this.close();

      // Open the newly created note in the active leaf
      await this.app.workspace.openLinkText(noteFile.path, '', false);
    } catch (err) {
      console.error('KMS Ask error:', err);
      const message = (err as Error).message;
      this.resultEl.textContent = `Error: ${message}`;
      new Notice(`KMS Error: ${message}`);
    } finally {
      this.isLoading = false;
      this.submitBtn.disabled = false;
      this.submitBtn.setText('Ask');
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
