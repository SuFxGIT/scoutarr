# @scoutarr/shared

Shared types and schemas for Scoutarr application.

## Contents

- **types/** - TypeScript type definitions
  - `config.ts` - Configuration types
  - `starr.ts` - Starr application types
  - `api.ts` - API response types

- **schemas/** - Zod validation schemas
  - `config.ts` - Configuration validation schemas

## Usage

```typescript
import { Config, RadarrInstance, configSchema } from '@scoutarr/shared';
```

## Building

```bash
npm run build
```

## Development

```bash
npm run watch
```
