/**
 * orbit-supabase Prototype Implementation
 * 
 * This is a proof-of-concept for a generic, reusable Orbit.js source
 * for Supabase PostgreSQL databases.
 * 
 * @example
 * ```typescript
 * const remote = new SupabaseSource({
 *   supabase: supabaseClient,
 *   schema: orbitSchema,
 *   getUserId: () => currentUser?.id,
 * });
 * ```
 */

import { Source } from '@orbit/data';
import type {
  InitializedRecord,
  RecordIdentity,
  RecordOperation,
  RecordQuery,
  RecordQueryExpression,
  RecordSchema,
  RecordTransformResult,
} from '@orbit/records';
import type { SupabaseClient } from '@supabase/supabase-js';


// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SupabaseSourceSettings {
  // Required
  supabase: SupabaseClient;
  schema: RecordSchema;

  // Optional - Basic Config
  name?: string;
  autoActivate?: boolean;

  // Optional - Authentication
  getUserId?: () => string | null | undefined;
  autoInjectUserId?: boolean; // Default: true
  userIdColumn?: string; // Default: 'user_id'

  // Optional - Table Mapping
  typeMap?: TypeMap;
  pluralize?: (type: string) => string;
  singularize?: (type: string) => string;

  // Optional - Attribute Transformation
  caseTransform?: 'snake_case' | 'camelCase' | 'none'; // Default: 'snake_case'

  // Optional - Query Configuration
  selectRelationships?: boolean; // Default: true (eager load)
}

export interface TypeMap {
  [orbitType: string]: TypeConfig;
}

export interface TypeConfig {
  tableName?: string;
  attributes?: AttributeMap;
  relationships?: RelationshipMap;
  timestamps?: {
    createdAt?: string;
    updatedAt?: string;
  };
  rls?: {
    enabled?: boolean;
    userIdColumn?: string;
  };
}

export interface AttributeMap {
  [orbitAttribute: string]: {
    column?: string;
    serialize?: (value: any) => any;
    deserialize?: (value: any) => any;
  };
}

export interface RelationshipMap {
  [relationshipName: string]: {
    type: 'hasOne' | 'hasMany';
    foreignKey?: string;
    inverseType?: string;
  };
}

// ============================================================================
// Main Source Class
// ============================================================================

export class SupabaseSource extends Source {
  private supabase: SupabaseClient;
  private getUserId?: () => string | null | undefined;
  private autoInjectUserId: boolean;
  private userIdColumn: string;
  private typeMap: TypeMap;
  private caseTransform: 'snake_case' | 'camelCase' | 'none';
  private selectRelationships: boolean;
  private inflector: InflectionHelper;
  private serializer: RecordSerializer;

  constructor(settings: SupabaseSourceSettings) {
    super(settings);

    this.supabase = settings.supabase;
    this.getUserId = settings.getUserId;
    this.autoInjectUserId = settings.autoInjectUserId ?? true;
    this.userIdColumn = settings.userIdColumn ?? 'user_id';
    this.typeMap = settings.typeMap ?? {};
    this.caseTransform = settings.caseTransform ?? 'snake_case';
    this.selectRelationships = settings.selectRelationships ?? true;

    // Initialize helpers
    this.inflector = new InflectionHelper(
      settings.pluralize,
      settings.singularize
    );
    this.serializer = new RecordSerializer(
      this.typeMap,
      this.caseTransform,
      this.inflector
    );
  }

  // --------------------------------------------------------------------------
  // Orbit Source Interface Implementation
  // --------------------------------------------------------------------------

  async _query(
    query: RecordQuery,
    _options?: Record<string, unknown>
  ): Promise<RecordTransformResult<InitializedRecord | InitializedRecord[]>> {
    const expressions = Array.isArray(query.expressions)
      ? query.expressions
      : [query.expressions];
    const results: InitializedRecord[] = [];

    for (const expression of expressions) {
      const expressionResults = await this.queryExpression(expression);
      results.push(...expressionResults);
    }

    return results;
  }

  async _update(
    operations: RecordOperation | RecordOperation[],
    _options?: Record<string, unknown>
  ): Promise<RecordTransformResult<InitializedRecord | InitializedRecord[]>> {
    const ops = Array.isArray(operations) ? operations : [operations];
    const results: InitializedRecord[] = [];

    for (const op of ops) {
      const result = await this.performOperation(op);
      if (result) {
        results.push(...(Array.isArray(result) ? result : [result]));
      }
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Query Operations
  // --------------------------------------------------------------------------

  private async queryExpression(
    expression: RecordQueryExpression
  ): Promise<InitializedRecord[]> {
    switch (expression.op) {
      case 'findRecords':
        return this.findRecords(expression.type as string);
      case 'findRecord':
        return this.findRecord(
          expression.record.type,
          expression.record.id
        ).then((r) => (r ? [r] : []));
      default:
        throw new Error(`Unsupported query operation: ${expression.op}`);
    }
  }

  private async findRecords(type: string): Promise<InitializedRecord[]> {
    const tableName = this.getTableName(type);
    const selectClause = this.buildSelectClause(type);

    let query = this.supabase
      .from(tableName)
      .select(selectClause)
      .order('created_at', { ascending: true });

    // Add RLS filter if enabled
    if (this.shouldApplyRLS(type)) {
      const userId = this.getUserId?.();
      if (!userId) {
        throw new Error('User ID required for RLS-enabled tables');
      }
      const userIdCol = this.getUserIdColumn(type);
      query = query.eq(userIdCol, userId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return (data ?? []).map((row) => this.serializer.deserialize(type, row));
  }

  private async findRecord(
    type: string,
    id: string
  ): Promise<InitializedRecord | null> {
    const tableName = this.getTableName(type);
    const selectClause = this.buildSelectClause(type);

    // Build query with RLS filter
    const baseQuery = this.supabase
      .from(tableName)
      .select(selectClause)
      .eq('id', id);

    // Add RLS filter if enabled
    if (this.shouldApplyRLS(type)) {
      const userId = this.getUserId?.();
      if (!userId) {
        throw new Error('User ID required for RLS-enabled tables');
      }
      const userIdCol = this.getUserIdColumn(type);
      const { data, error } = await baseQuery.eq(userIdCol, userId).single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw new Error(`Supabase query error: ${error.message}`);
      }

      return this.serializer.deserialize(type, data);
    }

    const { data, error } = await baseQuery.single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return this.serializer.deserialize(type, data);
  }

  // --------------------------------------------------------------------------
  // Update Operations
  // --------------------------------------------------------------------------

  private async performOperation(
    op: RecordOperation
  ): Promise<InitializedRecord | InitializedRecord[] | null> {
    switch (op.op) {
      case 'addRecord':
        return this.addRecord(op.record);
      case 'updateRecord':
        return this.updateRecord(op.record);
      case 'removeRecord':
        return this.removeRecord(op.record);
      case 'replaceRelatedRecord':
        return this.replaceRelatedRecord(
          op.record,
          op.relationship,
          op.relatedRecord
        );
      case 'replaceRelatedRecords':
        return this.replaceRelatedRecords(
          op.record,
          op.relationship,
          op.relatedRecords
        );
      case 'addToRelatedRecords':
        return this.addToRelatedRecords(
          op.record,
          op.relationship,
          op.relatedRecord
        );
      case 'removeFromRelatedRecords':
        return this.removeFromRelatedRecords(
          op.record,
          op.relationship,
          op.relatedRecord
        );
      default:
        throw new Error(`Unsupported operation: ${(op as any).op}`);
    }
  }

  private async addRecord(
    record: InitializedRecord
  ): Promise<InitializedRecord> {
    const tableName = this.getTableName(record.type);
    const row = this.serializer.serialize(record);

    // Inject user_id if RLS is enabled
    if (this.shouldApplyRLS(record.type) && this.autoInjectUserId) {
      const userId = this.getUserId?.();
      if (!userId) {
        throw new Error('User ID required for RLS-enabled tables');
      }
      row[this.getUserIdColumn(record.type)] = userId;
    }

    const { data, error } = await this.supabase
      .from(tableName)
      .insert(row)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase insert error: ${error.message}`);
    }

    return this.serializer.deserialize(record.type, data);
  }

  private async updateRecord(
    record: InitializedRecord
  ): Promise<InitializedRecord> {
    const tableName = this.getTableName(record.type);
    const row = this.serializer.serialize(record);

    // Remove immutable fields
    const { id, ...updateData } = row;

    const { data, error } = await this.supabase
      .from(tableName)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase update error: ${error.message}`);
    }

    return this.serializer.deserialize(record.type, data);
  }

  private async removeRecord(record: RecordIdentity): Promise<null> {
    const tableName = this.getTableName(record.type);

    const { error } = await this.supabase
      .from(tableName)
      .delete()
      .eq('id', record.id);

    if (error) {
      throw new Error(`Supabase delete error: ${error.message}`);
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Relationship Operations
  // --------------------------------------------------------------------------

  private async replaceRelatedRecord(
    record: RecordIdentity,
    relationship: string,
    relatedRecord: RecordIdentity | null
  ): Promise<null> {
    const relationshipConfig = this.getRelationshipConfig(
      record.type,
      relationship
    );

    if (relationshipConfig?.type === 'hasOne') {
      // Update foreign key on the record
      const foreignKey = relationshipConfig.foreignKey ?? `${relationship}_id`;
      const tableName = this.getTableName(record.type);
      const columnName = this.inflector.toSnakeCase(foreignKey);

      const { error } = await this.supabase
        .from(tableName)
        .update({ [columnName]: relatedRecord?.id ?? null })
        .eq('id', record.id);

      if (error) {
        throw new Error(`Supabase update error: ${error.message}`);
      }
    } else if (relationshipConfig?.type === 'hasMany') {
      // Update foreign key on the related record (inverse relationship)
      const inverseType = relatedRecord?.type;
      if (!inverseType) return null;

      const inverseForeignKey = `${record.type}_id`;
      const inverseTableName = this.getTableName(inverseType);
      const columnName = this.inflector.toSnakeCase(inverseForeignKey);

      const { error } = await this.supabase
        .from(inverseTableName)
        .update({ [columnName]: record.id })
        .eq('id', relatedRecord.id);

      if (error) {
        throw new Error(`Supabase update error: ${error.message}`);
      }
    }

    return null;
  }

  private async replaceRelatedRecords(
    record: RecordIdentity,
    relationship: string,
    relatedRecords: RecordIdentity[]
  ): Promise<null> {
    // For hasMany, update all related records
    for (const relatedRecord of relatedRecords) {
      await this.replaceRelatedRecord(record, relationship, relatedRecord);
    }
    return null;
  }

  private async addToRelatedRecords(
    record: RecordIdentity,
    relationship: string,
    relatedRecord: RecordIdentity
  ): Promise<null> {
    return this.replaceRelatedRecord(record, relationship, relatedRecord);
  }

  private async removeFromRelatedRecords(
    _record: RecordIdentity,
    _relationship: string,
    _relatedRecord: RecordIdentity
  ): Promise<null> {
    // No-op: handled by explicit removeRecord operations
    // Setting FK to null should be done via replaceRelatedRecord
    return null;
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private getTableName(type: string): string {
    return this.typeMap[type]?.tableName ?? this.inflector.pluralize(type);
  }

  private getTypeConfig(type: string): TypeConfig {
    return this.typeMap[type] ?? {};
  }

  private getRelationshipConfig(
    type: string,
    relationship: string
  ): RelationshipMap[string] | undefined {
    return this.getTypeConfig(type).relationships?.[relationship];
  }

  private shouldApplyRLS(type: string): boolean {
    const config = this.getTypeConfig(type);
    return config.rls?.enabled ?? this.autoInjectUserId;
  }

  private getUserIdColumn(type: string): string {
    const config = this.getTypeConfig(type);
    return config.rls?.userIdColumn ?? this.userIdColumn;
  }

  private buildSelectClause(type: string): string {
    const config = this.getTypeConfig(type);
    let select = '*';

    // Add relationship eager loading if enabled
    if (this.selectRelationships && config.relationships) {
      const relationships = Object.entries(config.relationships);
      const relationshipSelects = relationships
        .map(([name, rel]) => {
          if (rel.type === 'hasMany') {
            const relatedTable = this.getTableName(rel.inverseType ?? name);
            return `${name}:${relatedTable}(*)`;
          }
          return null;
        })
        .filter(Boolean);

      if (relationshipSelects.length > 0) {
        select = `*, ${relationshipSelects.join(', ')}`;
      }
    }

    return select;
  }
}

// ============================================================================
// Record Serializer
// ============================================================================

class RecordSerializer {
  constructor(
    private typeMap: TypeMap,
    private caseTransform: 'snake_case' | 'camelCase' | 'none',
    private inflector: InflectionHelper
  ) {}

  serialize(record: InitializedRecord): Record<string, any> {
    const row: Record<string, any> = { id: record.id };
    const typeConfig = this.typeMap[record.type] ?? {};
    const attributes = record.attributes ?? {};

    // Serialize attributes
    for (const [key, value] of Object.entries(attributes)) {
      const attrConfig = typeConfig.attributes?.[key];
      const columnName =
        attrConfig?.column ?? this.transformAttributeName(key);

      // Skip timestamps (managed by DB)
      if (
        columnName === (typeConfig.timestamps?.createdAt ?? 'created_at') ||
        columnName === (typeConfig.timestamps?.updatedAt ?? 'updated_at')
      ) {
        continue;
      }

      // Apply custom serializer if provided
      const serializedValue = attrConfig?.serialize
        ? attrConfig.serialize(value)
        : value;

      row[columnName] = serializedValue;
    }

    // Serialize relationships (foreign keys)
    const relationships = record.relationships ?? {};
    for (const [key, rel] of Object.entries(relationships)) {
      const relConfig = typeConfig.relationships?.[key];
      if (relConfig?.type === 'hasOne' && rel.data) {
        const foreignKey = relConfig.foreignKey ?? `${key}_id`;
        const columnName = this.inflector.toSnakeCase(foreignKey);
        row[columnName] = (rel.data as RecordIdentity).id;
      }
    }

    return row;
  }

  deserialize(type: string, row: Record<string, any>): InitializedRecord {
    const typeConfig = this.typeMap[type] ?? {};
    const attributes: Record<string, any> = {};
    const relationships: Record<string, any> = {};

    // Deserialize attributes
    for (const [columnName, value] of Object.entries(row)) {
      // Skip system columns and embedded relationships
      if (
        columnName === 'id' ||
        columnName === (typeConfig.rls?.userIdColumn ?? 'user_id') ||
        typeof value === 'object' &&
          Array.isArray(value) &&
          value.length > 0 &&
          typeof value[0] === 'object'
      ) {
        continue;
      }

      const attrName = this.findAttributeName(type, columnName);
      const attrConfig = typeConfig.attributes?.[attrName];

      // Apply custom deserializer if provided
      const deserializedValue = attrConfig?.deserialize
        ? attrConfig.deserialize(value)
        : value;

      attributes[attrName] = deserializedValue;
    }

    // Deserialize relationships
    if (typeConfig.relationships) {
      for (const [relName, relConfig] of Object.entries(
        typeConfig.relationships
      )) {
        if (relConfig.type === 'hasMany' && row[relName]) {
          // Embedded relationship data
          const relatedRows = row[relName];
          relationships[relName] = {
            data: relatedRows.map((r: any) => ({
              type: relConfig.inverseType ?? relName,
              id: r.id,
            })),
          };
        } else if (relConfig.type === 'hasOne') {
          const foreignKey = relConfig.foreignKey ?? `${relName}_id`;
          const columnName = this.inflector.toSnakeCase(foreignKey);
          if (row[columnName]) {
            relationships[relName] = {
              data: {
                type: relConfig.inverseType ?? relName,
                id: row[columnName],
              },
            };
          }
        }
      }
    }

    return {
      id: row.id,
      type,
      attributes,
      relationships,
    };
  }

  private transformAttributeName(orbitName: string): string {
    if (this.caseTransform === 'snake_case') {
      return this.inflector.toSnakeCase(orbitName);
    }
    return orbitName;
  }

  private findAttributeName(type: string, columnName: string): string {
    const typeConfig = this.typeMap[type] ?? {};

    // Check for explicit mapping
    if (typeConfig.attributes) {
      for (const [attrName, config] of Object.entries(typeConfig.attributes)) {
        if (config.column === columnName) {
          return attrName;
        }
      }
    }

    // Apply reverse case transformation
    if (this.caseTransform === 'snake_case') {
      return this.inflector.toCamelCase(columnName);
    }

    return columnName;
  }
}

// ============================================================================
// Inflection Helper
// ============================================================================

class InflectionHelper {
  private pluralizeFn: (word: string) => string;
  private singularizeFn: (word: string) => string;

  constructor(
    pluralize?: (word: string) => string,
    singularize?: (word: string) => string
  ) {
    // Use custom functions if provided, otherwise use simple defaults
    this.pluralizeFn = pluralize ?? this.defaultPluralize;
    this.singularizeFn = singularize ?? this.defaultSingularize;
  }

  pluralize(word: string): string {
    return this.pluralizeFn(word);
  }

  singularize(word: string): string {
    return this.singularizeFn(word);
  }

  toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private defaultPluralize(word: string): string {
    // Very basic pluralization - use a library like 'pluralize' in production
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    }
    if (
      word.endsWith('s') ||
      word.endsWith('x') ||
      word.endsWith('z') ||
      word.endsWith('ch') ||
      word.endsWith('sh')
    ) {
      return word + 'es';
    }
    return word + 's';
  }

  private defaultSingularize(word: string): string {
    // Very basic singularization
    if (word.endsWith('ies')) {
      return word.slice(0, -3) + 'y';
    }
    if (word.endsWith('es')) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s')) {
      return word.slice(0, -1);
    }
    return word;
  }
}

// ============================================================================
// Factory Function (Ember compatibility)
// ============================================================================

export default {
  create(settings: SupabaseSourceSettings) {
    return new SupabaseSource(settings);
  },
};
