/**
 * @fileoverview Smart TypeScript to Zod schema generator with pattern detection
 * @module ScaffoldEngine
 */

import {
  Project,
  SourceFile,
  TypeAliasDeclaration,
  InterfaceDeclaration,
  EnumDeclaration,
  ClassDeclaration,
  Type,
  Symbol,
  JSDocableNode,
  Node,
  SyntaxKind,
  TypeNode,
  PropertySignature,
  TypeLiteralNode
} from 'ts-morph';

export interface ScaffoldOptions {
  preserveJSDoc?: boolean;
  addRefinements?: boolean;
  detectPatterns?: boolean;
  handleGenerics?: boolean;
  incrementalUpdate?: boolean;
  twoWaySync?: boolean;
  importStrategy?: 'named' | 'namespace' | 'auto';
  customPatterns?: PatternDetector[];
}

export interface PatternDetector {
  name: string;
  test: (propertyName: string, type: string, jsDoc?: string) => boolean;
  refinement: string;
}

export interface GeneratedSchema {
  name: string;
  schema: string;
  imports: Set<string>;
  dependencies: Set<string>;
  jsDoc?: string;
  sourceType: 'interface' | 'type' | 'enum' | 'class';
  hasGenerics: boolean;
  refinements: string[];
}

export class ScaffoldEngine {
  private project: Project;
  private options: ScaffoldOptions;
  private patterns: PatternDetector[];
  private schemaCache: Map<string, GeneratedSchema> = new Map();

  constructor(options: ScaffoldOptions = {}) {
    this.options = {
      preserveJSDoc: true,
      addRefinements: true,
      detectPatterns: true,
      handleGenerics: true,
      incrementalUpdate: true,
      twoWaySync: false,
      importStrategy: 'auto',
      ...options
    };

    this.project = new Project({
      tsConfigFilePath: 'tsconfig.json',
      skipAddingFilesFromTsConfig: true
    });

    this.patterns = this.initializePatterns();
    if (options.customPatterns) {
      this.patterns.push(...options.customPatterns);
    }
  }

  private initializePatterns(): PatternDetector[] {
    return [
      {
        name: 'email',
        test: (name, type) =>
          type === 'string' && /email/i.test(name),
        refinement: '.email()'
      },
      {
        name: 'url',
        test: (name, type) =>
          type === 'string' && (/url|link|href/i.test(name)),
        refinement: '.url()'
      },
      {
        name: 'uuid',
        test: (name, type) =>
          type === 'string' && (/uuid|guid/i.test(name) || /^id$/i.test(name)),
        refinement: '.uuid()'
      },
      {
        name: 'date',
        test: (name, type) =>
          (type === 'Date' || type === 'string') &&
          (/date|time|timestamp|created|updated|modified/i.test(name)),
        refinement: type === 'Date' ? '' : '.datetime()'
      },
      {
        name: 'age',
        test: (name, type) =>
          type === 'number' && /age/i.test(name),
        refinement: '.min(0).max(150)'
      },
      {
        name: 'port',
        test: (name, type) =>
          type === 'number' && /port/i.test(name),
        refinement: '.min(1).max(65535)'
      },
      {
        name: 'percentage',
        test: (name, type) =>
          type === 'number' && (/percent|percentage|ratio/i.test(name)),
        refinement: '.min(0).max(100)'
      },
      {
        name: 'positive',
        test: (name, type) =>
          type === 'number' && (/count|amount|quantity|size|length/i.test(name)),
        refinement: '.min(0)'
      },
      {
        name: 'phone',
        test: (name, type) =>
          type === 'string' && (/phone|mobile|cell/i.test(name)),
        refinement: '.regex(/^\\+?[1-9]\\d{1,14}$/, "Invalid phone number")'
      },
      {
        name: 'ipAddress',
        test: (name, type) =>
          type === 'string' && (/ip|ipaddress|ip_address/i.test(name)),
        refinement: '.ip()'
      },
      {
        name: 'username',
        test: (name, type) =>
          type === 'string' && (/username|user_name/i.test(name)),
        refinement: '.min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, "Invalid username")'
      },
      {
        name: 'password',
        test: (name, type) =>
          type === 'string' && (/password|passwd|secret/i.test(name)),
        refinement: '.min(8).max(100)'
      },
      {
        name: 'slug',
        test: (name, type) =>
          type === 'string' && /slug/i.test(name),
        refinement: '.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug")'
      }
    ];
  }

  public async scaffoldFile(filePath: string): Promise<Map<string, GeneratedSchema>> {
    const sourceFile = this.project.addSourceFileAtPath(filePath);
    const schemas = new Map<string, GeneratedSchema>();

    // Process interfaces
    const interfaces = sourceFile.getInterfaces();
    for (const iface of interfaces) {
      const schema = this.convertInterface(iface);
      schemas.set(schema.name, schema);
    }

    // Process type aliases
    const types = sourceFile.getTypeAliases();
    for (const typeAlias of types) {
      const schema = this.convertTypeAlias(typeAlias);
      schemas.set(schema.name, schema);
    }

    // Process enums
    const enums = sourceFile.getEnums();
    for (const enumDecl of enums) {
      const schema = this.convertEnum(enumDecl);
      schemas.set(schema.name, schema);
    }

    // Process classes (if they look like DTOs)
    const classes = sourceFile.getClasses();
    for (const classDecl of classes) {
      if (this.isDtoClass(classDecl)) {
        const schema = this.convertClass(classDecl);
        schemas.set(schema.name, schema);
      }
    }

    // Cache results for incremental updates
    for (const [name, schema] of schemas) {
      this.schemaCache.set(name, schema);
    }

    return schemas;
  }

  private convertInterface(iface: InterfaceDeclaration): GeneratedSchema {
    const name = iface.getName();
    const schemaName = this.getSchemaName(name);
    const jsDoc = this.extractJSDoc(iface);
    const hasGenerics = iface.getTypeParameters().length > 0;

    const properties = iface.getProperties();
    const propertySchemas: string[] = [];
    const refinements: string[] = [];
    const imports = new Set<string>();
    const dependencies = new Set<string>();

    for (const prop of properties) {
      const propSchema = this.convertProperty(prop, imports, dependencies, refinements);
      propertySchemas.push(propSchema);
    }

    // Build the schema
    let schema = `export const ${schemaName} = z.object({\n`;
    schema += propertySchemas.map(p => `  ${p}`).join(',\n');
    schema += '\n})';

    // Add refinements at object level
    if (refinements.length > 0) {
      schema += refinements.join('');
    }

    // Add type export
    schema += `;\n\nexport type ${name} = z.infer<typeof ${schemaName}>;`;

    return {
      name: schemaName,
      schema,
      imports,
      dependencies,
      jsDoc,
      sourceType: 'interface',
      hasGenerics,
      refinements
    };
  }

  private convertTypeAlias(typeAlias: TypeAliasDeclaration): GeneratedSchema {
    const name = typeAlias.getName();
    const schemaName = this.getSchemaName(name);
    const jsDoc = this.extractJSDoc(typeAlias);
    const hasGenerics = typeAlias.getTypeParameters().length > 0;
    const imports = new Set<string>();
    const dependencies = new Set<string>();
    const refinements: string[] = [];

    const typeNode = typeAlias.getTypeNode();
    let schema = '';

    if (!typeNode) {
      // Fallback to type text
      const typeText = typeAlias.getType().getText();
      schema = this.convertTypeString(typeText, imports, dependencies, refinements);
    } else {
      schema = this.convertTypeNode(typeNode, imports, dependencies, refinements);
    }

    const fullSchema = `export const ${schemaName} = ${schema};\n\nexport type ${name} = z.infer<typeof ${schemaName}>;`;

    return {
      name: schemaName,
      schema: fullSchema,
      imports,
      dependencies,
      jsDoc,
      sourceType: 'type',
      hasGenerics,
      refinements
    };
  }

  private convertEnum(enumDecl: EnumDeclaration): GeneratedSchema {
    const name = enumDecl.getName();
    const schemaName = this.getSchemaName(name);
    const jsDoc = this.extractJSDoc(enumDecl);
    const imports = new Set<string>();

    const members = enumDecl.getMembers();
    const isStringEnum = members.every(m => m.getValue() && typeof m.getValue() === 'string');

    let schema = '';

    if (isStringEnum) {
      // Use z.enum for string enums
      const values = members.map(m => `'${m.getValue()}'`);
      schema = `export const ${schemaName} = z.enum([${values.join(', ')}])`;
    } else {
      // Use z.nativeEnum for numeric or mixed enums
      schema = `export enum ${name} {\n`;
      for (const member of members) {
        const value = member.getValue();
        schema += `  ${member.getName()} = ${typeof value === 'string' ? `'${value}'` : value},\n`;
      }
      schema += `}\n\nexport const ${schemaName} = z.nativeEnum(${name})`;
    }

    schema += `;\n\nexport type ${name}Type = z.infer<typeof ${schemaName}>;`;

    return {
      name: schemaName,
      schema,
      imports,
      dependencies: new Set(),
      jsDoc,
      sourceType: 'enum',
      hasGenerics: false,
      refinements: []
    };
  }

  private convertClass(classDecl: ClassDeclaration): GeneratedSchema {
    const name = classDecl.getName() || 'UnnamedClass';
    const schemaName = this.getSchemaName(name);
    const jsDoc = this.extractJSDoc(classDecl);
    const hasGenerics = classDecl.getTypeParameters().length > 0;

    const properties = classDecl.getProperties().filter(p => !p.isStatic());
    const propertySchemas: string[] = [];
    const refinements: string[] = [];
    const imports = new Set<string>();
    const dependencies = new Set<string>();

    for (const prop of properties) {
      const propName = prop.getName();
      const propType = prop.getType().getText();
      const isOptional = prop.hasQuestionToken();
      const propJsDoc = this.extractJSDoc(prop);

      let zodType = this.convertTypeString(propType, imports, dependencies, refinements);

      // Add pattern refinements
      if (this.options.detectPatterns) {
        const pattern = this.detectPattern(propName, propType, propJsDoc);
        if (pattern) {
          zodType += pattern.refinement;
        }
      }

      if (isOptional) {
        zodType += '.optional()';
      }

      propertySchemas.push(`${propName}: ${zodType}`);
    }

    let schema = `export const ${schemaName} = z.object({\n`;
    schema += propertySchemas.map(p => `  ${p}`).join(',\n');
    schema += '\n})';

    if (refinements.length > 0) {
      schema += refinements.join('');
    }

    schema += `;\n\nexport type ${name}Schema = z.infer<typeof ${schemaName}>;`;

    return {
      name: schemaName,
      schema,
      imports,
      dependencies,
      jsDoc,
      sourceType: 'class',
      hasGenerics,
      refinements
    };
  }

  private convertProperty(
    prop: PropertySignature,
    imports: Set<string>,
    dependencies: Set<string>,
    refinements: string[]
  ): string {
    const name = prop.getName();
    const type = prop.getType();
    const typeText = type.getText();
    const isOptional = prop.hasQuestionToken();
    const jsDoc = this.extractJSDoc(prop);

    let zodType = this.convertTypeString(typeText, imports, dependencies, refinements);

    // Add JSDoc as description if available
    if (this.options.preserveJSDoc && jsDoc) {
      zodType = `${zodType}.describe("${jsDoc.replace(/"/g, '\\"')}")`;
    }

    // Add pattern refinements
    if (this.options.detectPatterns) {
      const pattern = this.detectPattern(name, typeText, jsDoc);
      if (pattern) {
        zodType += pattern.refinement;
      }
    }

    if (isOptional) {
      zodType += '.optional()';
    }

    return `${name}: ${zodType}`;
  }

  private convertTypeNode(
    typeNode: TypeNode,
    imports: Set<string>,
    dependencies: Set<string>,
    refinements: string[]
  ): string {
    switch (typeNode.getKind()) {
      case SyntaxKind.StringKeyword:
        return 'z.string()';
      case SyntaxKind.NumberKeyword:
        return 'z.number()';
      case SyntaxKind.BooleanKeyword:
        return 'z.boolean()';
      case SyntaxKind.UndefinedKeyword:
        return 'z.undefined()';
      case SyntaxKind.NullKeyword:
        return 'z.null()';
      case SyntaxKind.VoidKeyword:
        return 'z.void()';
      case SyntaxKind.AnyKeyword:
        return 'z.any()';
      case SyntaxKind.UnknownKeyword:
        return 'z.unknown()';
      case SyntaxKind.NeverKeyword:
        return 'z.never()';
      case SyntaxKind.ArrayType:
        const arrayType = typeNode.asKind(SyntaxKind.ArrayType)!;
        const elementType = this.convertTypeNode(arrayType.getElementTypeNode(), imports, dependencies, refinements);
        return `z.array(${elementType})`;
      case SyntaxKind.UnionType:
        const unionType = typeNode.asKind(SyntaxKind.UnionType)!;
        const unionTypes = unionType.getTypeNodes().map(t =>
          this.convertTypeNode(t, imports, dependencies, refinements)
        );
        return `z.union([${unionTypes.join(', ')}])`;
      case SyntaxKind.IntersectionType:
        const intersectionType = typeNode.asKind(SyntaxKind.IntersectionType)!;
        const intersectionTypes = intersectionType.getTypeNodes().map(t =>
          this.convertTypeNode(t, imports, dependencies, refinements)
        );
        return intersectionTypes.length === 2
          ? `${intersectionTypes[0]}.and(${intersectionTypes[1]})`
          : `z.intersection(${intersectionTypes.join(', ')})`;
      case SyntaxKind.TypeLiteral:
        const typeLiteral = typeNode.asKind(SyntaxKind.TypeLiteral)!;
        return this.convertTypeLiteral(typeLiteral, imports, dependencies, refinements);
      case SyntaxKind.TypeReference:
        return this.convertTypeReference(typeNode, imports, dependencies);
      case SyntaxKind.LiteralType:
        const literal = typeNode.asKind(SyntaxKind.LiteralType)!;
        const literalText = literal.getText();
        if (literalText.startsWith('"') || literalText.startsWith("'")) {
          return `z.literal(${literalText})`;
        } else if (!isNaN(Number(literalText))) {
          return `z.literal(${literalText})`;
        } else if (literalText === 'true' || literalText === 'false') {
          return `z.literal(${literalText})`;
        }
        return 'z.unknown()';
      default:
        // Fallback to string representation
        return this.convertTypeString(typeNode.getText(), imports, dependencies, refinements);
    }
  }

  private convertTypeLiteral(
    typeLiteral: TypeLiteralNode,
    imports: Set<string>,
    dependencies: Set<string>,
    refinements: string[]
  ): string {
    const members = typeLiteral.getMembers();
    const properties: string[] = [];

    for (const member of members) {
      if (Node.isPropertySignature(member)) {
        const prop = this.convertProperty(member, imports, dependencies, refinements);
        properties.push(`  ${prop}`);
      }
    }

    return `z.object({\n${properties.join(',\n')}\n})`;
  }

  private convertTypeReference(
    typeNode: TypeNode,
    imports: Set<string>,
    dependencies: Set<string>
  ): string {
    const text = typeNode.getText();

    // Handle common built-in types
    if (text === 'Date') return 'z.date()';
    if (text === 'RegExp') return 'z.instanceof(RegExp)';
    if (text === 'Promise') return 'z.promise(z.unknown())';
    if (text === 'Map') return 'z.map(z.unknown(), z.unknown())';
    if (text === 'Set') return 'z.set(z.unknown())';
    if (text === 'Record') return 'z.record(z.unknown())';

    // Handle array notation
    if (text.endsWith('[]')) {
      const elementType = text.slice(0, -2);
      return `z.array(${this.convertTypeString(elementType, imports, dependencies, [])})`;
    }

    // Handle generics
    const genericMatch = text.match(/^(\w+)<(.+)>$/);
    if (genericMatch) {
      const [, base, args] = genericMatch;

      if (base === 'Array') {
        return `z.array(${this.convertTypeString(args, imports, dependencies, [])})`;
      }
      if (base === 'Promise') {
        return `z.promise(${this.convertTypeString(args, imports, dependencies, [])})`;
      }
      if (base === 'Record') {
        const [keyType, valueType] = args.split(',').map(s => s.trim());
        return `z.record(${this.convertTypeString(keyType, imports, dependencies, [])}, ${this.convertTypeString(valueType, imports, dependencies, [])})`;
      }
      if (base === 'Map') {
        const [keyType, valueType] = args.split(',').map(s => s.trim());
        return `z.map(${this.convertTypeString(keyType, imports, dependencies, [])}, ${this.convertTypeString(valueType, imports, dependencies, [])})`;
      }
      if (base === 'Set') {
        return `z.set(${this.convertTypeString(args, imports, dependencies, [])})`;
      }
      if (base === 'Partial') {
        return `${this.convertTypeString(args, imports, dependencies, [])}.partial()`;
      }
      if (base === 'Required') {
        return `${this.convertTypeString(args, imports, dependencies, [])}.required()`;
      }
      if (base === 'Readonly') {
        return `${this.convertTypeString(args, imports, dependencies, [])}.readonly()`;
      }

      // Custom type with generics - reference the schema
      dependencies.add(base);
      return `${this.getSchemaName(base)}`;
    }

    // Reference to another type/interface
    dependencies.add(text);
    return this.getSchemaName(text);
  }

  private convertTypeString(
    typeText: string,
    imports: Set<string>,
    dependencies: Set<string>,
    refinements: string[]
  ): string {
    // Handle primitive types
    if (typeText === 'string') return 'z.string()';
    if (typeText === 'number') return 'z.number()';
    if (typeText === 'boolean') return 'z.boolean()';
    if (typeText === 'undefined') return 'z.undefined()';
    if (typeText === 'null') return 'z.null()';
    if (typeText === 'void') return 'z.void()';
    if (typeText === 'any') return 'z.any()';
    if (typeText === 'unknown') return 'z.unknown()';
    if (typeText === 'never') return 'z.never()';
    if (typeText === 'Date') return 'z.date()';

    // Handle union types
    if (typeText.includes(' | ')) {
      const types = typeText.split(' | ').map(t => t.trim());
      const unionTypes = types.map(t => this.convertTypeString(t, imports, dependencies, refinements));

      // Check for null | undefined pattern
      if (types.length === 2) {
        if (types.includes('null') && types.includes('undefined')) {
          const baseType = unionTypes.find(t => t !== 'z.null()' && t !== 'z.undefined()');
          if (baseType) {
            return `${baseType}.nullish()`;
          }
        } else if (types.includes('null')) {
          const baseType = unionTypes.find(t => t !== 'z.null()');
          if (baseType) {
            return `${baseType}.nullable()`;
          }
        } else if (types.includes('undefined')) {
          const baseType = unionTypes.find(t => t !== 'z.undefined()');
          if (baseType) {
            return `${baseType}.optional()`;
          }
        }
      }

      return `z.union([${unionTypes.join(', ')}])`;
    }

    // Handle intersection types
    if (typeText.includes(' & ')) {
      const types = typeText.split(' & ').map(t => t.trim());
      const intersectionTypes = types.map(t => this.convertTypeString(t, imports, dependencies, refinements));
      return intersectionTypes.length === 2
        ? `${intersectionTypes[0]}.and(${intersectionTypes[1]})`
        : `z.intersection(${intersectionTypes.join(', ')})`;
    }

    // Handle literal types
    if (typeText.startsWith('"') || typeText.startsWith("'")) {
      return `z.literal(${typeText})`;
    }
    if (!isNaN(Number(typeText))) {
      return `z.literal(${typeText})`;
    }
    if (typeText === 'true' || typeText === 'false') {
      return `z.literal(${typeText})`;
    }

    // Handle array types
    if (typeText.endsWith('[]')) {
      const elementType = typeText.slice(0, -2);
      return `z.array(${this.convertTypeString(elementType, imports, dependencies, refinements)})`;
    }

    // Fallback - reference to another schema
    dependencies.add(typeText);
    return this.getSchemaName(typeText);
  }

  private detectPattern(propertyName: string, type: string, jsDoc?: string): PatternDetector | null {
    if (!this.options.detectPatterns) return null;

    for (const pattern of this.patterns) {
      if (pattern.test(propertyName, type, jsDoc)) {
        return pattern;
      }
    }

    return null;
  }

  private getSchemaName(typeName: string): string {
    // Convert PascalCase to camelCase and add Schema suffix
    return typeName.charAt(0).toLowerCase() + typeName.slice(1) + 'Schema';
  }

  private extractJSDoc(node: JSDocableNode): string | undefined {
    if (!this.options.preserveJSDoc) return undefined;

    const jsDocs = node.getJsDocs();
    if (jsDocs.length === 0) return undefined;

    const comments: string[] = [];
    for (const jsDoc of jsDocs) {
      const comment = jsDoc.getDescription();
      if (comment) {
        comments.push(comment.trim());
      }
    }

    return comments.length > 0 ? comments.join(' ') : undefined;
  }

  private isDtoClass(classDecl: ClassDeclaration): boolean {
    // Check if class looks like a DTO/model
    // - Has properties but no complex methods
    // - Name ends with common suffixes
    const name = classDecl.getName() || '';
    const dtoSuffixes = ['DTO', 'Model', 'Entity', 'Schema', 'Type', 'Interface', 'Request', 'Response', 'Payload'];

    if (dtoSuffixes.some(suffix => name.endsWith(suffix))) {
      return true;
    }

    // Check if it has mostly properties and simple methods
    const methods = classDecl.getMethods();
    const properties = classDecl.getProperties();

    // If more properties than methods, likely a DTO
    return properties.length > 0 && methods.length <= 2;
  }

  public async generateImports(schemas: Map<string, GeneratedSchema>): string {
    const allImports = new Set<string>();
    const zodImports = new Set(['z']);

    // Collect all Zod utilities used
    for (const schema of schemas.values()) {
      if (schema.schema.includes('z.enum')) zodImports.add('z');
      if (schema.schema.includes('z.nativeEnum')) zodImports.add('z');
      // Add more as needed
    }

    // Generate import statement based on strategy
    switch (this.options.importStrategy) {
      case 'namespace':
        return `import * as z from 'zod';\n\n`;
      case 'named':
        return `import { ${Array.from(zodImports).join(', ')} } from 'zod';\n\n`;
      case 'auto':
      default:
        // Use namespace if many imports, otherwise named
        return zodImports.size > 5
          ? `import * as z from 'zod';\n\n`
          : `import { z } from 'zod';\n\n`;
    }
  }

  public clearCache(): void {
    this.schemaCache.clear();
  }

  public getCachedSchema(name: string): GeneratedSchema | undefined {
    return this.schemaCache.get(name);
  }
}