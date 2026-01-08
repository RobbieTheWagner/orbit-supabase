/**
 * Quick Start Example
 * 
 * This example shows the minimal setup needed to use orbit-supabase
 */

import { createClient } from '@supabase/supabase-js';
import { SupabaseSource } from 'orbit-supabase';
import { RecordSchema } from '@orbit/records';

// 1. Set up your Orbit schema
const schema = new RecordSchema({
  models: {
    post: {
      attributes: {
        title: { type: 'string' },
        content: { type: 'string' },
        createdAt: { type: 'datetime' },
        updatedAt: { type: 'datetime' },
      },
      relationships: {
        author: { kind: 'hasOne', type: 'user' },
      },
    },
    user: {
      attributes: {
        name: { type: 'string' },
        email: { type: 'string' },
        createdAt: { type: 'datetime' },
        updatedAt: { type: 'datetime' },
      },
      relationships: {
        posts: { kind: 'hasMany', type: 'post', inverse: 'author' },
      },
    },
  },
});

// 2. Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// 3. Create SupabaseSource with zero config!
const remote = new SupabaseSource({
  supabase,
  schema,
  name: 'remote',
  getUserId: () => {
    // Return the current user's ID
    // This will be injected into all queries/mutations for RLS
    return 'user-123';
  },
});

// That's it! The source will automatically:
// - Map 'post' type to 'posts' table
// - Map 'user' type to 'users' table
// - Convert camelCase attributes to snake_case columns
// - Handle relationships via foreign keys
// - Inject user_id for RLS

// Example usage with Orbit coordinator
import { Coordinator } from '@orbit/coordinator';
import { MemorySource } from '@orbit/memory';

const memory = new MemorySource({ schema });
const coordinator = new Coordinator({ sources: [memory, remote] });

// Add sync strategies
import { RequestStrategy, SyncStrategy } from '@orbit/coordinator';

// Push local changes to remote
coordinator.addStrategy(
  new RequestStrategy({
    source: 'memory',
    on: 'beforeUpdate',
    target: 'remote',
    action: 'update',
    blocking: false,
  })
);

// Pull remote changes to local
coordinator.addStrategy(
  new SyncStrategy({
    source: 'remote',
    target: 'memory',
    blocking: true,
  })
);

// Activate the coordinator
await coordinator.activate();

// Now you can use the memory source and it will sync to Supabase!
await memory.update((t) => [
  t.addRecord({
    type: 'post',
    attributes: {
      title: 'Hello World',
      content: 'This is my first post!',
    },
  }),
]);

console.log('Post created and synced to Supabase!');
