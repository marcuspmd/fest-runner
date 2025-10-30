import * as vscode from "vscode";
import { FlowTestEngineUpdateService } from "./flowTestEngineUpdateService";

export interface SchemaEnumValue {
  value: string;
  description?: string;
}

export interface SchemaFieldInfo {
  name: string;
  type?: string;
  description?: string;
  documentationUrl?: string;
  required?: boolean;
  enumValues?: SchemaEnumValue[];
  examples?: string[];
  defaultValue?: string;
}

export interface SchemaValueSuggestion {
  value: string;
  description?: string;
  origin: "enum" | "example" | "boolean" | "default";
}

interface RawSchema {
  version?: unknown;
  root?: unknown;
  metadata?: Record<string, unknown> | undefined;
  structures?: Record<string, unknown> | undefined;
}

interface RawStructure {
  description?: unknown;
  documentationUrl?: unknown;
  docsUrl?: unknown;
  fields?: Record<string, unknown> | undefined;
  properties?: Record<string, unknown> | undefined;
}

interface RawField {
  type?: unknown;
  description?: unknown;
  documentationUrl?: unknown;
  docsUrl?: unknown;
  docUrl?: unknown;
  required?: unknown;
  enum?: unknown;
  accepts?: unknown;
  values?: unknown;
  examples?: unknown;
  default?: unknown;
  ref?: unknown;
  $ref?: unknown;
  reference?: unknown;
  structure?: unknown;
  items?: unknown;
  elements?: unknown;
  elementType?: unknown;
  valueType?: unknown;
  fields?: Record<string, unknown> | undefined;
  properties?: Record<string, unknown> | undefined;
  oneOf?: unknown;
  anyOf?: unknown;
}

interface ParsedSchema {
  version?: string;
  rootStructureName?: string;
  structures: Record<string, RawStructure>;
  raw: RawSchema;
}

interface SchemaStructureWrap {
  name?: string;
  struct: RawStructure;
}

interface SchemaFieldWrap {
  name?: string;
  field: RawField;
  parentStructure?: RawStructure;
}

interface SchemaResolution {
  structure?: SchemaStructureWrap;
  field?: SchemaFieldWrap;
}

export class FlowTestSchemaService implements vscode.Disposable {
  private schema: ParsedSchema | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

  constructor(
    private readonly engineUpdateService: FlowTestEngineUpdateService
  ) {
    const subscription = this.engineUpdateService.onDidUpdateSchema(() => {
      void this.reload();
    });
    this.disposables.push(subscription);
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
    this.disposables.forEach((item) => item.dispose());
  }

  get onDidChange(): vscode.Event<void> {
    return this.onDidChangeEmitter.event;
  }

  async initialize(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const schemaUri = this.engineUpdateService.getGeneratedInterfacePath();
    try {
      const buffer = await vscode.workspace.fs.readFile(schemaUri);
      const contents = Buffer.from(buffer).toString("utf8");
      const parsedJson = JSON.parse(contents);
      this.schema = this.parseSchema(parsedJson);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        this.schema = undefined;
      } else {
        console.warn("Failed to load Flow Test Engine schema:", error);
        this.schema = undefined;
      }
    }

    this.onDidChangeEmitter.fire();
  }

  hasSchema(): boolean {
    return Boolean(this.schema);
  }

  getKeySuggestions(path: Array<string | number>): SchemaFieldInfo[] {
    const resolution = this.resolvePath(this.toSegments(path));
    if (!resolution) {
      return [];
    }

    const structure =
      this.resolveFieldToStructure(resolution.field?.field) ??
      resolution.structure;

    if (!structure) {
      return [];
    }

    const fields = this.getFieldsFromStructure(structure.struct);
    const suggestions: SchemaFieldInfo[] = [];
    for (const [name, rawField] of Object.entries(fields)) {
      suggestions.push(this.buildFieldInfo(name, rawField));
    }
    return suggestions;
  }

  getFieldInfo(path: Array<string | number>): SchemaFieldInfo | undefined {
    const resolution = this.resolvePath(this.toSegments(path));
    if (!resolution?.field) {
      return undefined;
    }
    const field = resolution.field;
    return this.buildFieldInfo(field.name ?? "", field.field);
  }

  getFieldInfoForKey(
    path: Array<string | number>,
    key: string
  ): SchemaFieldInfo | undefined {
    if (!key) {
      return undefined;
    }
    const segments = this.toSegments([...path, key]);
    const resolution = this.resolvePath(segments);
    if (!resolution?.field) {
      return undefined;
    }
    return this.buildFieldInfo(key, resolution.field.field);
  }

  getValueSuggestions(path: Array<string | number>): SchemaValueSuggestion[] {
    const resolution = this.resolvePath(this.toSegments(path));
    if (!resolution?.field) {
      return [];
    }

    const field = resolution.field.field;
    const suggestions: SchemaValueSuggestion[] = [];
    const seen = new Set<string>();

    const push = (
      value: string,
      origin: SchemaValueSuggestion["origin"],
      description?: string
    ) => {
      if (!value || seen.has(value)) {
        return;
      }
      seen.add(value);
      suggestions.push({ value, origin, description });
    };

    const enumValues = this.extractEnumValues(field);
    enumValues.forEach((entry) => {
      push(entry.value, "enum", entry.description);
    });

    if (this.isBooleanField(field, enumValues)) {
      push("true", "boolean");
      push("false", "boolean");
    }

    const defaultValue = this.extractDefault(field);
    if (defaultValue) {
      push(defaultValue, "default");
    }

    const examples = this.extractExamples(field);
    examples.forEach((example) => {
      push(example, "example");
    });

    return suggestions;
  }

  private parseSchema(raw: unknown): ParsedSchema | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const schemaObj = raw as RawSchema;
    const structures = this.ensureStructureRecord(schemaObj.structures);
    const rootStructureName = this.resolveRootStructureName(
      schemaObj,
      structures
    );

    const parsed: ParsedSchema = {
      raw: schemaObj,
      structures,
      rootStructureName,
    };

    if (typeof schemaObj.version === "string") {
      parsed.version = schemaObj.version;
    }

    return parsed;
  }

  private ensureStructureRecord(
    value: Record<string, unknown> | undefined
  ): Record<string, RawStructure> {
    if (!value) {
      return {};
    }
    const result: Record<string, RawStructure> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry && typeof entry === "object") {
        result[key] = entry as RawStructure;
      }
    }
    return result;
  }

  private resolveRootStructureName(
    schema: RawSchema,
    structures: Record<string, RawStructure>
  ): string | undefined {
    const metadata = schema.metadata ?? {};
    const candidates: Array<unknown> = [
      schema.root,
      (metadata as Record<string, unknown>).rootStructure,
      (metadata as Record<string, unknown>).root,
      "TestSuite",
    ];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      if (candidate === "TestSuite" || candidate in structures) {
        return candidate;
      }
    }

    const keys = Object.keys(structures);
    return keys.length > 0 ? keys[0] : undefined;
  }

  private toSegments(path: Array<string | number>): string[] {
    return path
      .map((segment) =>
        typeof segment === "number" ? "*" : String(segment ?? "")
      )
      .filter((segment) => segment.length > 0);
  }

  private resolvePath(segments: string[]): SchemaResolution | undefined {
    if (!this.schema) {
      return undefined;
    }

    let structure = this.getRootStructure();
    if (!structure) {
      return undefined;
    }

    let lastStructure = structure;
    let lastField: SchemaFieldWrap | undefined;

    if (segments.length === 0) {
      return { structure, field: undefined };
    }

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];

      if (segment === "*") {
        const target = this.resolveArrayItemsStructure(lastField?.field);
        if (!target) {
          return undefined;
        }
        structure = target;
        lastStructure = target;
        lastField = undefined;
        continue;
      }

      if (!structure) {
        const derived = this.resolveFieldToStructure(lastField?.field);
        if (!derived) {
          return undefined;
        }
        structure = derived;
        lastStructure = derived;
      }

      const fields = this.getFieldsFromStructure(structure.struct);
      const rawField = fields[segment];
      if (!rawField) {
        return undefined;
      }

      lastField = {
        name: segment,
        field: rawField,
        parentStructure: structure.struct,
      };

      const isLast = index === segments.length - 1;
      if (isLast) {
        break;
      }

      const nextSegment = segments[index + 1];
      if (nextSegment === "*") {
        continue;
      }

      const nestedStructure = this.resolveFieldToStructure(rawField);
      if (!nestedStructure) {
        return undefined;
      }

      structure = nestedStructure;
      lastStructure = nestedStructure;
      lastField = undefined;
    }

    return {
      structure: structure ?? lastStructure,
      field: lastField,
    };
  }

  private getRootStructure(): SchemaStructureWrap | undefined {
    if (!this.schema) {
      return undefined;
    }

    const candidate = this.getStructureByName(this.schema.rootStructureName);
    if (candidate) {
      return candidate;
    }

    const entries = Object.entries(this.schema.structures);
    if (entries.length === 0) {
      return undefined;
    }

    const [name, struct] = entries[0];
    return { name, struct };
  }

  private getStructureByName(name?: string): SchemaStructureWrap | undefined {
    if (!name || !this.schema) {
      return undefined;
    }
    const struct = this.schema.structures[name];
    if (struct) {
      return { name, struct };
    }
    return undefined;
  }

  private getFieldsFromStructure(
    structure: RawStructure | undefined
  ): Record<string, RawField> {
    if (!structure) {
      return {};
    }

    return (
      this.ensureFieldRecord(structure.fields) ??
      this.ensureFieldRecord(structure.properties) ??
      {}
    );
  }

  private ensureFieldRecord(
    value: Record<string, unknown> | undefined
  ): Record<string, RawField> | undefined {
    if (!value) {
      return undefined;
    }
    const result: Record<string, RawField> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry && typeof entry === "object") {
        result[key] = entry as RawField;
      }
    }
    return result;
  }

  private resolveFieldToStructure(field?: RawField): SchemaStructureWrap | undefined {
    if (!field) {
      return undefined;
    }

    const reference = this.getReferenceName(field);
    if (reference) {
      const resolved = this.getStructureByName(reference);
      if (resolved) {
        return resolved;
      }
    }

    const inlineFields =
      this.ensureFieldRecord(field.fields) ??
      this.ensureFieldRecord(field.properties);

    if (inlineFields && Object.keys(inlineFields).length > 0) {
      return {
        struct: {
          description: field.description,
          documentationUrl: field.documentationUrl ?? field.docsUrl ?? field.docUrl,
          fields: inlineFields,
        },
      };
    }

    const variants = [...this.ensureArray(field.oneOf), ...this.ensureArray(field.anyOf)];
    for (const variant of variants) {
      if (variant && typeof variant === "object") {
        const resolved = this.resolveFieldToStructure(variant as RawField);
        if (resolved) {
          return resolved;
        }
      }
    }

    return undefined;
  }

  private resolveArrayItemsStructure(field?: RawField): SchemaStructureWrap | undefined {
    if (!field) {
      return undefined;
    }

    const candidates = [
      field.items,
      field.elements,
      field.elementType,
      field.valueType,
    ];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object") {
        const resolved = this.resolveFieldToStructure(candidate as RawField);
        if (resolved) {
          return resolved;
        }
        const inlineFields =
          this.ensureFieldRecord((candidate as RawField).fields) ??
          this.ensureFieldRecord((candidate as RawField).properties);
        if (inlineFields && Object.keys(inlineFields).length > 0) {
          return {
            struct: {
              description: (candidate as RawField).description,
              documentationUrl:
                (candidate as RawField).documentationUrl ??
                (candidate as RawField).docsUrl ??
                (candidate as RawField).docUrl,
              fields: inlineFields,
            },
          };
        }
      } else if (typeof candidate === "string") {
        const reference = this.asString(candidate);
        if (reference) {
          const resolved = this.getStructureByName(reference);
          if (resolved) {
            return resolved;
          }
        }
      }
    }

    return undefined;
  }

  private buildFieldInfo(name: string, field: RawField): SchemaFieldInfo {
    return {
      name,
      type: this.determineType(field),
      description: this.asString(field.description),
      documentationUrl: this.extractDocumentationUrl(field),
      required: this.extractRequired(field),
      enumValues: this.extractEnumValues(field),
      examples: this.extractExamples(field),
      defaultValue: this.extractDefault(field),
    };
  }

  private extractEnumValues(field: RawField): SchemaEnumValue[] {
    const source = this.ensureArray(field.enum) ??
      this.ensureArray(field.values) ??
      this.ensureArray(field.accepts);

    if (!source || source.length === 0) {
      return [];
    }

    const result: SchemaEnumValue[] = [];
    const seen = new Set<string>();

    for (const entry of source) {
      if (entry === null || entry === undefined) {
        continue;
      }

      if (
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean"
      ) {
        const value = String(entry);
        if (!seen.has(value)) {
          seen.add(value);
          result.push({ value });
        }
        continue;
      }

      if (typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const value =
          this.asString(record.value) ??
          this.asString(record.name) ??
          this.asString(record.label);
        if (!value || seen.has(value)) {
          continue;
        }
        seen.add(value);
        const description =
          this.asString(record.description) ?? this.asString(record.label);
        result.push({ value, description });
      }
    }

    return result;
  }

  private extractExamples(field: RawField): string[] {
    const rawExamples = this.ensureArray(field.examples);
    if (!rawExamples || rawExamples.length === 0) {
      return [];
    }

    const result: string[] = [];
    const seen = new Set<string>();

    rawExamples.forEach((example) => {
      const formatted = this.formatValue(example);
      if (!formatted || seen.has(formatted)) {
        return;
      }
      seen.add(formatted);
      result.push(formatted);
    });

    return result;
  }

  private extractDefault(field: RawField): string | undefined {
    if (field.default === undefined) {
      return undefined;
    }
    return this.formatValue(field.default);
  }

  private determineType(field: RawField): string | undefined {
    if (typeof field.type === "string") {
      const normalized = field.type.toLowerCase();
      if (normalized === "array") {
        const itemCandidate =
          (field.items as RawField | undefined) ??
          (field.elements as RawField | undefined) ??
          (field.elementType as RawField | undefined) ??
          (field.valueType as RawField | undefined);
        const itemType = itemCandidate
          ? this.determineType(itemCandidate)
          : undefined;
        return itemType ? `array<${itemType}>` : "array";
      }
      return normalized;
    }

    const reference = this.getReferenceName(field);
    if (reference) {
      return reference;
    }

    if (field.fields || field.properties) {
      return "object";
    }

    return undefined;
  }

  private extractRequired(field: RawField): boolean | undefined {
    if (typeof field.required === "boolean") {
      return field.required;
    }
    if (typeof field.required === "string") {
      const normalized = field.required.toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }
    return undefined;
  }

  private extractDocumentationUrl(field: RawField): string | undefined {
    return (
      this.asString(field.documentationUrl) ??
      this.asString(field.docsUrl) ??
      this.asString(field.docUrl)
    );
  }

  private getReferenceName(field: RawField): string | undefined {
    return (
      this.asString(field.ref) ??
      this.asString(field.$ref) ??
      this.asString(field.reference) ??
      this.asString(field.structure)
    );
  }

  private asString(value: unknown): string | undefined {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
  }

  private ensureArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }

  private formatValue(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  private isBooleanField(
    field: RawField,
    enumValues: SchemaEnumValue[]
  ): boolean {
    if (typeof field.type === "string") {
      return field.type.toLowerCase() === "boolean";
    }

    if (enumValues.length === 2) {
      const normalized = enumValues.map((entry) => entry.value.toLowerCase());
      return normalized.includes("true") && normalized.includes("false");
    }

    return false;
  }
}
