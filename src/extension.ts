import * as vscode from 'vscode';
import { AntiDrawEditorProvider } from './editor/AntiDrawEditorProvider.js';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(AntiDrawEditorProvider.register(context));

  const openEditorCmd = vscode.commands.registerCommand(
    'antidraw.openEditor',
    (uri?: vscode.Uri) => {
      const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (targetUri) {
        const isAdrw = targetUri.path.toLowerCase().endsWith('.adrw');
        vscode.commands.executeCommand(
          'vscode.openWith',
          targetUri,
          isAdrw ? AntiDrawEditorProvider.projectEditorViewType : AntiDrawEditorProvider.viewType
        );
      } else {
        vscode.window.showErrorMessage('No SVG or .adrw file selected to open with AntiDraw Editor.');
      }
    }
  );

  context.subscriptions.push(openEditorCmd);
}

export function deactivate() {}
