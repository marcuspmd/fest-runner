import * as vscode from "vscode";
import { FlowTestLanguageService } from "../services/flowTestLanguageService";

export class FlowTestHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly languageService: FlowTestLanguageService
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    try {
      return this.languageService.provideHover(document, position);
    } catch (error) {
      console.warn("FlowTest hover provider failed:", error);
      return undefined;
    }
  }
}
