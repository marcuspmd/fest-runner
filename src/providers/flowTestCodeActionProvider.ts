import * as vscode from "vscode";
import { FlowTestLanguageService } from "../services/flowTestLanguageService";

export class FlowTestCodeActionProvider
  implements vscode.CodeActionProvider
{
  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  constructor(
    private readonly languageService: FlowTestLanguageService
  ) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    if (
      context.only &&
      !context.only.contains(vscode.CodeActionKind.QuickFix)
    ) {
      return [];
    }

    try {
      const proposals = this.languageService.getQuickFixes(document);
      return proposals.map((proposal) => {
        const action = new vscode.CodeAction(
          proposal.title,
          vscode.CodeActionKind.QuickFix
        );
        const edit = new vscode.WorkspaceEdit();
        edit.set(document.uri, [proposal.edit]);
        action.edit = edit;
        action.isPreferred = proposal.isPreferred ?? false;
        return action;
      });
    } catch (error) {
      console.warn("FlowTest code action provider failed:", error);
      return [];
    }
  }
}
