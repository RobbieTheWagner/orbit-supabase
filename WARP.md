# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Watch mode with automatic rebuilds (tsup)
- `npm run build` - Build the package (outputs to dist/)
- `npm run build:watch` - Alternative watch mode for builds

### Testing
- `npm test` - Run tests once with Vitest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report (target: >80%)

### Code Quality
- `npm run typecheck` - Type check with TypeScript (strict mode enabled)
- `npm run lint` - Check for lint issues
- `npm run lint:fix` - Auto-fix lint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is formatted

### Publishing
- `npm run prepublishOnly` - Runs build and test before publishing
- `npm run release` - Build and publish to npm

## Architecture

orbit-supabase is a generic Orbit.js source adapter for Supabase PostgreSQL databases. It provides convention-over-configuration defaults to eliminate boilerplate when connecting Orbit.js applications to Supabase backends.

### Core Components

**SupabaseSource** (`src/source.ts`)
- Extends Orbit.js `Source` class
- Implements `_query()` for reading records (findRecords, findRecord)
- Implements `_update()` for mutations (addRecord, updateRecord, removeRecord, relationship operations)
- Handles RLS (Row Level Security) with automatic user_id injection
- Convention-based table mapping with full configuration overrides

**RecordSerializer** (internal class in `src/source.ts`)
- Transforms between Orbit.js InitializedRecord format and Supabase row format
- Handles snake_case ↔ camelCase conversion
- Supports custom attribute serializers/deserializers
- Manages foreign key relationships in serialization

**InflectionHelper** (internal class in `src/source.ts`)
- Provides pluralization/singularization (basic defaults, customizable)
- Case transformation utilities (toSnakeCase, toCamelCase)

### Convention Defaults

The package uses these conventions which can be overridden via `typeMap` configuration:
- Table names: pluralized type names (e.g., "post" → "posts")
- Attributes: camelCase in Orbit, snake_case in database
- Foreign keys: `{relationship}_id` pattern
- RLS: automatic user_id injection when `getUserId` is provided
- Timestamps: created_at/updated_at managed by database

### Configuration Pattern

Configuration flows through three levels:
1. Global defaults (SupabaseSourceSettings)
2. Per-type configuration (TypeMap)
3. Per-attribute configuration (AttributeMap)

When implementing features, respect this hierarchy and ensure overrides work at all levels.

## Code Style

- TypeScript strict mode is enforced
- ESLint with TypeScript plugin + Prettier for formatting
- Use meaningful variable names that reflect Orbit.js vs Supabase context (e.g., `orbitRecord`, `supabaseRow`)
- Prefer explicit type annotations for public APIs
- Private methods start with underscore for Orbit interface methods (_query, _update)

## Testing Approach

- Unit tests in `test/` directory using Vitest
- Mock the Supabase client - never hit real databases in tests
- Test both convention-based behavior and configuration overrides
- Test RLS behavior with and without user_id
- Test error handling (network errors, constraint violations, etc.)

## Key Constraints

- **Peer dependencies**: Must maintain compatibility with @orbit/core, @orbit/data, @orbit/records >=0.17.0
- **Node version**: Requires Node.js >=22.0.0
- **No runtime database**: All Supabase interactions go through supabase-js client
- **RLS-aware**: Must respect Supabase Row Level Security policies
- **Framework-agnostic**: Should work with both vanilla Orbit.js and ember-orbit

## Related Swach Project

This package was extracted from the Swach color palette application. When questions arise about real-world usage, reference:
- docs/ORBIT_SUPABASE_USAGE_EXAMPLE.md for how Swach uses it
- The original prototype reduced Swach's transformation logic from ~500 lines to ~50 lines of configuration

## Build Output

- `dist/index.js` - CommonJS build
- `dist/index.mjs` - ESM build  
- `dist/index.d.ts` - TypeScript declarations
- Package uses tsup for zero-config bundling
