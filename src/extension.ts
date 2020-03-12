import * as vscode from 'vscode';
import {AutoUsingWorkPlace} from './autousing-csharp-workplace';

export function activate(context: vscode.ExtensionContext) {
    const autoUsing = new AutoUsingWorkPlace(context);
    autoUsing.start();
}

export function deactivate() {}
