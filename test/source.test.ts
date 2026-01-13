import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseSource } from '../src/index';
import type { RecordSchema, InitializedRecord } from '@orbit/records';
import { RecordSchema as RecordSchemaClass } from '@orbit/records';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
function createMockSupabase() {
  // Create mock that supports both chaining AND direct awaiting
  const mockQuery: any = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    mockResolvedValue: vi.fn(),
  };

  // Make all methods return `this` for chaining
  mockQuery.select.mockReturnValue(mockQuery);
  mockQuery.insert.mockReturnValue(mockQuery);
  mockQuery.update.mockReturnValue(mockQuery);
  mockQuery.delete.mockReturnValue(mockQuery);
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.order.mockReturnValue(mockQuery);
  mockQuery.single.mockReturnValue(mockQuery);

  // Add mockResolvedValue that returns the chain
  mockQuery.mockResolvedValue = (value: any) => {
    // Make the query promise-like
    mockQuery.then = (resolve: any) => Promise.resolve(value).then(resolve);
    mockQuery.catch = (reject: any) => Promise.resolve(value).catch(reject);
    return mockQuery;
  };

  return {
    from: vi.fn().mockReturnValue(mockQuery),
    _mockQuery: mockQuery,
  } as unknown as SupabaseClient & { _mockQuery: typeof mockQuery };
}

// Create a basic schema for testing
function createTestSchema(): RecordSchema {
  return new RecordSchemaClass({
    models: {
      post: {
        attributes: {
          title: { type: 'string' },
          content: { type: 'string' },
          publishedAt: { type: 'datetime' },
          viewCount: { type: 'number' },
        },
        relationships: {
          author: { kind: 'hasOne', type: 'user' },
          comments: { kind: 'hasMany', type: 'comment' },
        },
      },
      user: {
        attributes: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
        },
        relationships: {
          posts: { kind: 'hasMany', type: 'post' },
        },
      },
      comment: {
        attributes: {
          text: { type: 'string' },
        },
        relationships: {
          post: { kind: 'hasOne', type: 'post' },
        },
      },
    },
  });
}

describe('SupabaseSource', () => {
  let mockSupabase: SupabaseClient & { _mockQuery: any };
  let schema: RecordSchema;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    schema = createTestSchema();
  });

  describe('constructor', () => {
    it('should create instance with minimal config', () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
      });

      expect(source).toBeInstanceOf(SupabaseSource);
    });

    it('should accept optional configuration', () => {
      const getUserId = () => 'user-123';

      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        name: 'remote',
        getUserId,
        autoInjectUserId: true,
        userIdColumn: 'owner_id',
        caseTransform: 'snake_case',
      });

      expect(source).toBeInstanceOf(SupabaseSource);
    });
  });

  describe('serialization and deserialization', () => {
    it('should convert camelCase attributes to snake_case on insert', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Hello World',
          content: 'This is a test',
          published_at: '2024-01-01T00:00:00Z',
          view_count: 42,
          user_id: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: {
            title: 'Hello World',
            content: 'This is a test',
            publishedAt: '2024-01-01T00:00:00Z',
            viewCount: 42,
          },
        },
      };

      await (source as any)._update(operation);

      expect(mockSupabase.from).toHaveBeenCalledWith('posts');
      expect(mockSupabase._mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'post-1',
          title: 'Hello World',
          content: 'This is a test',
          published_at: '2024-01-01T00:00:00Z',
          view_count: 42,
          user_id: 'user-123',
        })
      );
    });

    it('should convert snake_case columns to camelCase attributes on query', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        autoInjectUserId: false,
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [
          {
            id: 'post-1',
            title: 'Hello World',
            content: 'Test content',
            published_at: '2024-01-01T00:00:00Z',
            view_count: 42,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      const result = (await (source as any)._query(
        query
      )) as InitializedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].attributes?.publishedAt).toBe('2024-01-01T00:00:00Z');
      expect(result[0].attributes?.viewCount).toBe(42);
    });

    it('should handle relationships as foreign keys during serialization', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
        typeMap: {
          post: {
            relationships: {
              author: { type: 'hasOne', foreignKey: 'author_id' },
            },
          },
        },
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Hello World',
          author_id: 'user-456',
          user_id: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'Hello World' },
          relationships: {
            author: {
              data: { type: 'user', id: 'user-456' },
            },
          },
        },
      };

      await (source as any)._update(operation);

      expect(mockSupabase._mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'post-1',
          title: 'Hello World',
          author_id: 'user-456',
          user_id: 'user-123',
        })
      );
    });

    it('should deserialize foreign keys as relationships', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        autoInjectUserId: false,
        typeMap: {
          post: {
            relationships: {
              author: {
                type: 'hasOne',
                foreignKey: 'author_id',
                inverseType: 'user',
              },
            },
          },
        },
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [
          {
            id: 'post-1',
            title: 'Hello World',
            author_id: 'user-456',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      const result = (await (source as any)._query(
        query
      )) as InitializedRecord[];

      expect(result).toHaveLength(1);
      expect(result[0].relationships?.author).toEqual({
        data: { type: 'user', id: 'user-456' },
      });
    });

    it('should skip timestamp fields during serialization', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Hello World',
          user_id: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: {
            title: 'Hello World',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      await (source as any)._update(operation);

      const insertCall = mockSupabase._mockQuery.insert.mock.calls[0][0];
      expect(insertCall).not.toHaveProperty('created_at');
      expect(insertCall).not.toHaveProperty('updated_at');
    });

    it('should skip user_id column during deserialization', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [
          {
            id: 'post-1',
            title: 'Hello World',
            user_id: 'user-123',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      const result = (await (source as any)._query(
        query
      )) as InitializedRecord[];
      const record = result[0];

      expect(record.attributes).not.toHaveProperty('userId');
      expect(record.attributes).not.toHaveProperty('user_id');
    });
  });

  describe('RLS (Row Level Security)', () => {
    it('should inject user_id when adding records with RLS enabled', async () => {
      const getUserId = vi.fn(() => 'user-123');
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId,
        autoInjectUserId: true,
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Test',
          user_id: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'Test' },
        },
      };

      await (source as any)._update(operation);

      expect(getUserId).toHaveBeenCalled();
      expect(mockSupabase._mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-123' })
      );
    });

    it('should filter by user_id when querying with RLS enabled', async () => {
      const getUserId = vi.fn(() => 'user-123');
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId,
        autoInjectUserId: true,
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      await (source as any)._query(query);

      expect(getUserId).toHaveBeenCalled();
      expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith(
        'user_id',
        'user-123'
      );
    });

    it('should use custom RLS column name', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
        typeMap: {
          post: {
            rls: {
              enabled: true,
              userIdColumn: 'owner_id',
            },
          },
        },
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      await (source as any)._query(query);

      expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith(
        'owner_id',
        'user-123'
      );
    });

    it('should throw error when user_id is missing for RLS-enabled table', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => null,
        autoInjectUserId: true,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'Test' },
        },
      };

      await expect((source as any)._update(operation)).rejects.toThrow(
        'User ID required for RLS-enabled tables'
      );
    });

    it('should disable RLS for specific type', async () => {
      const getUserId = vi.fn(() => 'user-123');
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId,
        typeMap: {
          post: {
            rls: { enabled: false },
          },
        },
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Test',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'Test' },
        },
      };

      await (source as any)._update(operation);

      const insertCall = mockSupabase._mockQuery.insert.mock.calls[0][0];
      expect(insertCall).not.toHaveProperty('user_id');
    });
  });

  describe('CRUD operations', () => {
    it('should insert a new record (addRecord)', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'New Post',
          user_id: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'New Post' },
        },
      };

      const result = await (source as any)._update(operation);

      expect(mockSupabase.from).toHaveBeenCalledWith('posts');
      expect(mockSupabase._mockQuery.insert).toHaveBeenCalled();
      expect(mockSupabase._mockQuery.select).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update an existing record (updateRecord)', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Updated Title',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
        error: null,
      });

      const operation = {
        op: 'updateRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'Updated Title' },
        },
      };

      await (source as any)._update(operation);

      expect(mockSupabase.from).toHaveBeenCalledWith('posts');
      expect(mockSupabase._mockQuery.update).toHaveBeenCalled();
      expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith('id', 'post-1');
    });

    it('should not include id in update data', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: { id: 'post-1', title: 'Updated' },
        error: null,
      });

      const operation = {
        op: 'updateRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'Updated' },
        },
      };

      await (source as any)._update(operation);

      const updateCall = mockSupabase._mockQuery.update.mock.calls[0][0];
      expect(updateCall).not.toHaveProperty('id');
    });

    it('should delete a record (removeRecord)', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      const operation = {
        op: 'removeRecord' as const,
        record: { type: 'post', id: 'post-1' },
      };

      await (source as any)._update(operation);

      expect(mockSupabase.from).toHaveBeenCalledWith('posts');
      expect(mockSupabase._mockQuery.delete).toHaveBeenCalled();
      expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith('id', 'post-1');
    });

    it('should query all records of a type (findRecords)', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [
          {
            id: 'post-1',
            title: 'Post 1',
            user_id: 'user-123',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'post-2',
            title: 'Post 2',
            user_id: 'user-123',
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
          },
        ],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      const result = (await (source as any)._query(
        query
      )) as InitializedRecord[];

      expect(result).toHaveLength(2);
      expect(mockSupabase.from).toHaveBeenCalledWith('posts');
      expect(mockSupabase._mockQuery.order).toHaveBeenCalledWith('created_at', {
        ascending: true,
      });
    });

    it('should query a single record by id (findRecord)', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Post 1',
          user_id: 'user-123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecord' as const,
          record: { type: 'post', id: 'post-1' },
        },
      };

      const result = (await (source as any)._query(
        query
      )) as InitializedRecord[];

      expect(result).toBeDefined();
      expect(mockSupabase.from).toHaveBeenCalledWith('posts');
      expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith('id', 'post-1');
    });

    it('should return empty array when record not found', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      });

      const query = {
        expressions: {
          op: 'findRecord' as const,
          record: { type: 'post', id: 'post-999' },
        },
      };

      const result = (await (source as any)._query(
        query
      )) as InitializedRecord[];

      expect(result).toEqual([]);
    });

    it('should throw error on insert failure', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed', code: '23505' },
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: { title: 'Test' },
        },
      };

      await expect((source as any)._update(operation)).rejects.toThrow(
        'Supabase insert error: Insert failed'
      );
    });
  });

  describe('custom configuration', () => {
    it('should use custom table names', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        autoInjectUserId: false,
        typeMap: {
          post: { tableName: 'blog_posts' },
        },
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      await (source as any)._query(query);

      expect(mockSupabase.from).toHaveBeenCalledWith('blog_posts');
    });

    it('should use custom pluralization function', async () => {
      const customPluralize = (word: string) => `${word}_collection`;

      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        pluralize: customPluralize,
        autoInjectUserId: false,
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      await (source as any)._query(query);

      expect(mockSupabase.from).toHaveBeenCalledWith('post_collection');
    });

    it('should apply custom attribute serializers', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        getUserId: () => 'user-123',
        typeMap: {
          post: {
            attributes: {
              publishedAt: {
                serialize: (value) => new Date(value).toISOString(),
              },
            },
          },
        },
      });

      mockSupabase._mockQuery.single.mockResolvedValue({
        data: {
          id: 'post-1',
          title: 'Test',
          published_at: '2024-01-01T00:00:00.000Z',
          user_id: 'user-123',
        },
        error: null,
      });

      const operation = {
        op: 'addRecord' as const,
        record: {
          type: 'post',
          id: 'post-1',
          attributes: {
            title: 'Test',
            publishedAt: '2024-01-01T00:00:00Z',
          },
        },
      };

      await (source as any)._update(operation);

      expect(mockSupabase._mockQuery.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          published_at: '2024-01-01T00:00:00.000Z',
        })
      );
    });

    it('should apply custom attribute deserializers', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        autoInjectUserId: false,
        typeMap: {
          post: {
            attributes: {
              publishedAt: {
                deserialize: (value) => new Date(value).toISOString(),
              },
            },
          },
        },
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: [
          {
            id: 'post-1',
            title: 'Test',
            published_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      const query = {
        expressions: {
          op: 'findRecords' as const,
          type: 'post',
        },
      };

      const result = (await (source as any)._query(
        query
      )) as InitializedRecord[];
      const record = result[0];

      expect(record.attributes?.publishedAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('relationship operations', () => {
    it('should update hasOne relationship', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        typeMap: {
          post: {
            relationships: {
              author: { type: 'hasOne', foreignKey: 'author_id' },
            },
          },
        },
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      const operation = {
        op: 'replaceRelatedRecord' as const,
        record: { type: 'post', id: 'post-1' },
        relationship: 'author',
        relatedRecord: { type: 'user', id: 'user-456' },
      };

      await (source as any)._update(operation);

      expect(mockSupabase.from).toHaveBeenCalledWith('posts');
      expect(mockSupabase._mockQuery.update).toHaveBeenCalledWith({
        author_id: 'user-456',
      });
      expect(mockSupabase._mockQuery.eq).toHaveBeenCalledWith('id', 'post-1');
    });

    it('should clear hasOne relationship', async () => {
      const source = new SupabaseSource({
        supabase: mockSupabase,
        schema,
        typeMap: {
          post: {
            relationships: {
              author: { type: 'hasOne', foreignKey: 'author_id' },
            },
          },
        },
      });

      mockSupabase._mockQuery.mockResolvedValue({
        data: null,
        error: null,
      });

      const operation = {
        op: 'replaceRelatedRecord' as const,
        record: { type: 'post', id: 'post-1' },
        relationship: 'author',
        relatedRecord: null,
      };

      await (source as any)._update(operation);

      expect(mockSupabase._mockQuery.update).toHaveBeenCalledWith({
        author_id: null,
      });
    });
  });
});
