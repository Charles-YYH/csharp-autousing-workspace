import * as vscode from 'vscode';
import { readFile } from 'fs';

const REG_CR = /\r/;

export class AutoUsingWorkPlace
    implements vscode.CompletionItemProvider, vscode.CodeActionProvider {
    entityNamespace: { [key: string]: string } = {};
    entityData: { [key: string]: vscode.CompletionItem } = {};
    REG_USING = /using (\w.*);/gm;

    constructor(private readonly context: vscode.ExtensionContext) {}

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        if (context && context.diagnostics) {
            const symbols = this.getSymbols(context.diagnostics);
            if (symbols.length > 0) {
                console.log(symbols);
                const edit = new vscode.WorkspaceEdit();
                symbols.forEach(symbol =>
                    edit.insert(
                        document.uri,
                        new vscode.Position(0, 0),
                        `using ${this.entityNamespace[symbol]};\n`
                    )
                );
                vscode.workspace.applyEdit(edit);
            }
        }
        return [];
    }

    getSymbols(diags: readonly vscode.Diagnostic[]): string[] {
        const test = /The name '(?<name>\w+)' does not exist in the current context/;
        const r: string[] = [];
        diags.forEach(d => {
            const result = d.message.match(test);
            if (result) {
                r.push(result?.groups?.name as string);
            }
        });
        const indexedKeys = Object.keys(this.entityData);
        return r.filter(symbol => indexedKeys.includes(symbol));
    }

    start(): void {
        const completionItem = vscode.languages.registerCompletionItemProvider(
            'csharp',
            this
        );
        const actionItem = vscode.languages.registerCodeActionsProvider(
            'csharp',
            this
        );
        const reindexCommand = vscode.commands.registerCommand(
            'autousing-csharp-workspace.reindex',
            () => this.reindex()
        );
        this.context.subscriptions.push(
            completionItem,
            reindexCommand,
            actionItem
        );
        vscode.commands.executeCommand('autousing-csharp-workspace.reindex', {
            showOutput: true
        });
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const currentLine = document.getText(
            new vscode.Range(position.line, 0, position.line + 1, 0)
        );
        if (currentLine.includes('.')) {
            return [];
        }
        const usings = document.getText().match(this.REG_USING);
        let excludeList: string[] = [];
        if (usings) {
            excludeList = usings.map(s => s.split(' ')[1]);
        }
        let indications: vscode.CompletionItem[] = [];
        Object.keys(this.entityData).forEach(key => {
            if (excludeList.some(n => n.includes(this.entityNamespace[key]))) {
                return;
            }
            indications.push(this.entityData[key]);
        });
        return indications;
    }

    reindex() {
        vscode.workspace.findFiles('**/*.cs').then(files => {
            const pros = files.map(uri => this.processFile(uri));
            this.entityNamespace = {};
            this.entityData = {};
            Promise.all(pros).then(() => {
                console.log(
                    `Finished, ${Object.keys(this.entityData).length} symbols`
                );
            });
        });
    }

    async processFile(uri: vscode.Uri) {
        let fileData = await readFilePromise(uri);
        fileData = fileData.replace(REG_CR, '');

        const REG_NAMESPACE_BLOCK = /^namespace (\w+\.)*\w+ {((?!namespace).)*^}$/gms;
        const namespaces = fileData.match(REG_NAMESPACE_BLOCK);
        if (namespaces !== null) {
            namespaces.forEach(match => this.processNamespace(match));
        }
    }

    processNamespace(data: string) {
        const REG_NAMESPACE = /^namespace (?<name>(\w+\.)*\w+) /;
        const REG_SYMBOL = /(class|interface|struct|enum) (?<name>[A-Z]\w*)/gm;
        const potentialNamespace = data.match(REG_NAMESPACE);
        const potentialSymbols = data.match(REG_SYMBOL);
        const namespaceName = potentialNamespace?.groups?.name;
        if (namespaceName && potentialSymbols) {
            potentialSymbols.forEach(symbol => {
                const splited = symbol.split(' ');
                const name = splited[1];
                const type = splited[0];
                let kind: vscode.CompletionItemKind;
                switch (type) {
                    case 'class':
                        kind = vscode.CompletionItemKind.Class;
                        break;
                    case 'interface':
                        kind = vscode.CompletionItemKind.Interface;
                        break;
                    case 'struct':
                        kind = vscode.CompletionItemKind.Struct;
                        break;
                    case 'enum':
                        kind = vscode.CompletionItemKind.Enum;
                        break;
                    default:
                        throw new Error('NEW BE NO KIND');
                }
                const data: vscode.CompletionItem = {
                    label: name,
                    detail: `from ${namespaceName}`,
                    kind
                };
                this.entityNamespace[name] = namespaceName;
                this.entityData[name] = data;
            });
        }
    }
}

function readFilePromise(uri: vscode.Uri): Promise<string> {
    return new Promise<string>((res, rej) => {
        readFile(uri.fsPath, 'utf8', (err, data) => {
            if (err) {
                rej(err);
            } else {
                res(data);
            }
        });
    });
}
