import * as vscode from 'vscode';
import { runMcpCleanup } from './mcp-cleanup.js';

export type ActiveSkillState = {
  correlationId: string;
  skillId: string;
  expiresAt: number;
  ttlMs: number;
};

export class ActiveSkillManager {
  private state: ActiveSkillState | undefined;
  private timer: NodeJS.Timeout | undefined;
  private tickTimer: NodeJS.Timeout | undefined;
  private statusBar: vscode.StatusBarItem;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionPath: string,
  ) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.statusBar.command = 'skillpilot.dismissActiveSkill';
    context.subscriptions.push(this.statusBar);
    const saved = context.workspaceState.get<ActiveSkillState>('skillpilot.active');
    if (saved && saved.expiresAt > Date.now()) {
      this.arm(saved, false);
    }
  }

  get active(): ActiveSkillState | undefined {
    return this.state;
  }

  register(correlationId: string, skillId: string, ttlMs: number): void {
    this.clearTimers();
    const state: ActiveSkillState = {
      correlationId,
      skillId,
      ttlMs,
      expiresAt: Date.now() + ttlMs,
    };
    this.arm(state, true);
  }

  async dismiss(manual: boolean): Promise<void> {
    const current = this.state;
    this.clearTimers();
    this.state = undefined;
    this.statusBar.hide();
    await this.context.workspaceState.update('skillpilot.active', undefined);
    if (!current) {
      if (manual) {
        vscode.window.showInformationMessage('SkillPilot: no active skill to dismiss.');
      }
      return;
    }
    await this.invokeCleanup(current.correlationId, current.skillId, manual);
  }

  dispose(): void {
    this.clearTimers();
    this.statusBar.dispose();
  }

  private arm(state: ActiveSkillState, persist: boolean): void {
    this.state = state;
    if (persist) {
      void this.context.workspaceState.update('skillpilot.active', state);
    }
    this.updateStatusBar();
    const remaining = state.expiresAt - Date.now();
    this.timer = setTimeout(() => void this.onTtlFire(), Math.max(0, remaining));
    this.tickTimer = setInterval(() => this.updateStatusBar(), 30_000);
  }

  private clearTimers(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.timer = undefined;
    this.tickTimer = undefined;
  }

  private updateStatusBar(): void {
    if (!this.state) return;
    const remainingMs = Math.max(0, this.state.expiresAt - Date.now());
    const mins = Math.ceil(remainingMs / 60_000);
    this.statusBar.text = `$(book) Skill: ${this.state.skillId} (${mins}m)`;
    this.statusBar.tooltip = `SkillPilot active — click to dismiss (cleanup).\nExpires: ${new Date(this.state.expiresAt).toLocaleString()}`;
    this.statusBar.show();
  }

  private async onTtlFire(): Promise<void> {
    const current = this.state;
    if (!current) return;
    const config = vscode.workspace.getConfiguration('skillpilot');
    const prompt = config.get<boolean>('promptBeforeCleanup', false);
    if (prompt) {
      const choice = await vscode.window.showWarningMessage(
        `SkillPilot: TTL expired for "${current.skillId}". Run cleanup?`,
        'Cleanup',
        'Keep active',
      );
      if (choice !== 'Cleanup') {
        return;
      }
    }
    await this.dismiss(false);
    vscode.window.showInformationMessage(`SkillPilot: TTL expired — cleanup sent for ${current.skillId}.`);
  }

  private async invokeCleanup(correlationId: string, skillId: string, manual: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration('skillpilot');
    const auto = config.get<boolean>('autoCleanupOnTtl', true);
    if (!auto && !manual) return;

    const serverEntry = config.get<string>('serverEntry', '').trim();
    const skillRoot = config.get<string>('skillRoot', '').trim();
    if (!serverEntry) {
      vscode.window.showWarningMessage(
        'SkillPilot: set skillpilot.serverEntry to your dist/index.js path to run MCP cleanup from the extension.',
      );
      return;
    }

    try {
      await runMcpCleanup(
        correlationId,
        serverEntry,
        skillRoot || undefined,
        this.extensionPath,
      );
      if (manual) {
        vscode.window.showInformationMessage(`SkillPilot: cleanup ok for ${skillId}.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`SkillPilot cleanup failed: ${msg}`);
    }
  }
}
