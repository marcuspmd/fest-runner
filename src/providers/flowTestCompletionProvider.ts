import * as vscode from "vscode";
import { FlowTestLanguageService } from "../services/flowTestLanguageService";

export class FlowTestCompletionProvider
  implements vscode.CompletionItemProvider
{
  constructor(
    private readonly languageService: FlowTestLanguageService
  ) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | undefined> {
    try {
      return await this.languageService.provideCompletions(document, position);
    } catch (error) {
      console.warn("FlowTest completion provider failed:", error);
      return undefined;
    }
  }
}
