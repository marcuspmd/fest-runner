import * as vscode from 'vscode';
import { UserInputRequest } from '../models/types';

export class InputService {
  private static instance: InputService;
  private inputCache: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): InputService {
    if (!InputService.instance) {
      InputService.instance = new InputService();
    }
    return InputService.instance;
  }

  async handleUserInput(
    request: UserInputRequest,
    options?: {
      useCache?: boolean;
      updateCache?: boolean;
      suppressNotifications?: boolean;
    }
  ): Promise<string | undefined> {
    const {
      useCache = true,
      updateCache = true,
      suppressNotifications = false
    } = options ?? {};
    const cacheKey = `${request.stepName}:${request.inputName}`;

    if (useCache && this.inputCache.has(cacheKey)) {
      const cachedValue = this.inputCache.get(cacheKey)!;
      if (!suppressNotifications) {
        vscode.window.showInformationMessage(
          `Using cached input for ${request.inputName}: ${
            request.masked ? '***' : cachedValue
          }`
        );
      }
      return cachedValue;
    }

    const type = (request.type || '').toLowerCase();

    if (type === 'select' && request.options && request.options.length > 0) {
      vscode.window.showInformationMessage(request.prompt);
      const items = request.options.map((option, index) => ({
        label: option.label || String(option.value),
        description: option.description,
        detail:
          option.value !== undefined && option.value !== null
            ? String(option.value)
            : undefined,
        picked:
          request.defaultValue !== undefined &&
          String(option.value) === String(request.defaultValue),
        value: option.value,
        index
      })) as Array<vscode.QuickPickItem & { value: unknown; index: number }>;

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: request.prompt,
        ignoreFocusOut: true,
        canPickMany: false
      });

      if (!picked) {
        if (request.required) {
          throw new Error(`Required input '${request.inputName}' was not provided`);
        }
        return undefined;
      }

      const value = String(picked.value ?? picked.label ?? picked.index + 1);
      if (updateCache) {
        this.inputCache.set(cacheKey, value);
      }
      return value;
    }

    if (type === 'confirm') {
      const confirmOptions = [
        { label: 'Sim', value: 'y', picked: request.defaultValue === 'y' },
        { label: 'Não', value: 'n', picked: request.defaultValue === 'n' }
      ] as Array<vscode.QuickPickItem & { value: string }>;

      const picked = await vscode.window.showQuickPick(confirmOptions, {
        placeHolder: request.prompt,
        ignoreFocusOut: true,
        canPickMany: false
      });

      if (!picked) {
        if (request.required) {
          throw new Error(`Required input '${request.inputName}' was not provided`);
        }
        return undefined;
      }

      const value = picked.value;
      if (updateCache) {
        this.inputCache.set(cacheKey, value);
      }
      return value;
    }

    const isNumber = type === 'number';
    const inputOptions: vscode.InputBoxOptions = {
      prompt: request.prompt,
      placeHolder: request.defaultValue
        ? `${request.defaultValue}`
        : `Enter value for ${request.inputName}`,
      password: request.masked || type === 'password',
      ignoreFocusOut: true,
      value: request.defaultValue,
      validateInput: (value: string) => {
        if (!value) {
          if (request.required && !request.defaultValue) {
            return 'This field is required';
          }
          return undefined;
        }

        if (isNumber && isNaN(Number(value))) {
          return 'Please enter a valid number';
        }

        return undefined;
      }
    };

    const userInput = await vscode.window.showInputBox(inputOptions);

    if (userInput !== undefined) {
      if (updateCache) {
        this.inputCache.set(cacheKey, userInput);
      }
      return userInput;
    }

    if (request.required && !request.defaultValue) {
      throw new Error(`Required input '${request.inputName}' was not provided`);
    }

    return request.defaultValue;
  }

  getCachedInput(stepName: string, inputName: string): string | undefined {
    const cacheKey = `${stepName}:${inputName}`;
    return this.inputCache.get(cacheKey);
  }

  setCachedInput(stepName: string, inputName: string, value: string): void {
    const cacheKey = `${stepName}:${inputName}`;
    this.inputCache.set(cacheKey, value);
  }

  clearCache(): void {
    this.inputCache.clear();
  }

  clearCacheForStep(stepName: string): void {
    const keysToDelete = Array.from(this.inputCache.keys())
      .filter(key => key.startsWith(`${stepName}:`));

    keysToDelete.forEach(key => this.inputCache.delete(key));
  }

  getAllCachedInputs(): Record<string, string> {
    const result: Record<string, string> = {};
    this.inputCache.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  loadCachedInputs(inputs: Record<string, string>): void {
    Object.entries(inputs).forEach(([key, value]) => {
      this.inputCache.set(key, value);
    });
  }

  async promptForInputMode(): Promise<'use-cached' | 'prompt-new' | 'cancel'> {
    if (this.inputCache.size === 0) {
      return 'prompt-new';
    }

    const options = [
      {
        label: 'Use Cached Values',
        description: 'Use previously entered input values',
        value: 'use-cached' as const
      },
      {
        label: 'Enter New Values',
        description: 'Prompt for new input values',
        value: 'prompt-new' as const
      }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'How would you like to handle test inputs?',
      ignoreFocusOut: true
    });

    return selected?.value || 'cancel';
  }

  async showCachedInputs(): Promise<void> {
    if (this.inputCache.size === 0) {
      vscode.window.showInformationMessage('No cached inputs available');
      return;
    }

    const items = Array.from(this.inputCache.entries()).map(([key, value]) => {
      const [stepName, inputName] = key.split(':', 2);
      return {
        label: inputName,
        description: stepName,
        detail: value.length > 50 ? `${value.substring(0, 47)}...` : value
      };
    });

    await vscode.window.showQuickPick(items, {
      placeHolder: 'Cached Input Values',
      ignoreFocusOut: true,
      canPickMany: false
    });
  }

  async editCachedInput(): Promise<void> {
    if (this.inputCache.size === 0) {
      vscode.window.showInformationMessage('No cached inputs available');
      return;
    }

    const items = Array.from(this.inputCache.entries()).map(([key, value]) => {
      const [stepName, inputName] = key.split(':', 2);
      return {
        label: inputName,
        description: stepName,
        detail: value,
        key
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select input to edit',
      ignoreFocusOut: true
    });

    if (!selected) {
      return;
    }

    const [stepName, inputName] = selected.key.split(':', 2);
    const newValue = await vscode.window.showInputBox({
      prompt: `Edit value for ${inputName} in ${stepName}`,
      value: selected.detail,
      ignoreFocusOut: true
    });

    if (newValue !== undefined) {
      this.inputCache.set(selected.key, newValue);
      vscode.window.showInformationMessage(`Updated ${inputName} value`);
    }
  }
}
