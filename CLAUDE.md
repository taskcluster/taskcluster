# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Taskcluster is a task execution framework supporting Mozilla's continuous integration and release processes. It's a monorepo containing microservices (in Node.js and Go), client libraries (JS, Go, Python, Rust, Shell), a React UI, and infrastructure tooling.

## Repository Structure

- `services/` - Microservices (auth, queue, github, hooks, worker-manager, web-server, etc.)
- `libraries/` - Shared Node.js libraries (api, config, postgres, pulse, monitor, etc.)
- `clients/` - Client libraries for multiple languages
- `ui/` - React-based web interface
- `db/` - Database schema and migrations (Postgres)
- `tools/` - Go tools (worker-runner, websocktunnel, livelog, taskcluster-proxy, etc.)
- `workers/` - Worker implementations (docker-worker, generic-worker)
- `infrastructure/` - Build tooling and Kubernetes deployment configs
- `dev-docs/` - Development documentation

## Key Commands

### Development Setup
```bash
# Install dependencies
yarn

# Start Postgres (required for most development)
docker run -ti -p 127.0.0.1:5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e LC_COLLATE=en_US.UTF8 -e LC_CTYPE=en_US.UTF8 --rm postgres:15

# Set database URL for tests
export TEST_DB_URL=postgresql://postgres@localhost/postgres
```

### Testing
```bash
# Run all tests for a specific service/library
cd services/queue  # or libraries/postgres, etc.
yarn test

# Run specific test file
mocha test/api_test.js

# Run test until first failure
mocha -b test/api_test.js

# Run all tests across all workspaces
yarn test
```

### Code Generation
```bash
# Generate API references, client code, and DB schema docs
# Requires Postgres to be running
docker compose up -d postgres pg_init_db
export TEST_DB_URL=postgresql://postgres@localhost:5432/taskcluster-test
yarn generate
```

### Linting
```bash
yarn lint           # Lint JavaScript/TypeScript
yarn lint:fix       # Auto-fix linting issues
yarn lint:go        # Lint Go code
yarn lint:py        # Lint Python code
```

### Building
```bash
# Build the Docker monoimage (can run any service)
yarn build

# Build and tag for release
yarn release
```

### Local Development with Docker Compose
```bash
# Start all services in production mode
yarn start  # or: docker compose up -d

# Stop services
yarn stop   # or: docker compose down --remove-orphans

# Start services in development mode (allows code changes)
yarn dev:start
# Start specific services in dev mode
yarn dev:start queue-web web-server-web

# Stop dev services
yarn dev:stop

# Initialize dev environment
yarn dev:init

# Database operations
yarn dev:db:upgrade
yarn dev:db:downgrade
```

### Database Management
```bash
yarn db:upgrade     # Apply migrations
yarn db:downgrade   # Rollback migrations
yarn db:new         # Create new migration
yarn db:renumber    # Renumber migration files
```

### UI Development
```bash
cd ui
export TASKCLUSTER_ROOT_URL=https://community-tc.services.mozilla.com
yarn start  # Runs on http://localhost:5080
```

## Architecture

### Microservices
Each service in `services/` is a standalone Node.js application with:
- `src/` - Service implementation
- `test/` - Test suite
- `procs.yml` - Process definitions (web servers, cron jobs, background tasks)
- `config.yml` - Service configuration schema
- `package.json` - Dependencies

Services communicate via:
- REST APIs (defined using @taskcluster/lib-api)
- Pulse (AMQP message bus)
- Postgres database (shared schema)

### Database
- Postgres 15 is used for all persistent storage
- Schema is versioned in `db/versions/*.yml` files
- Each version includes migration and downgrade scripts
- Database functions are defined per-service in `db/fns/`
- Access control is defined in `db/access.yml`
- **Critical**: Never modify existing version files; always add new versions for changes

### Libraries
Shared Node.js libraries in `libraries/` provide:
- `api` - API definition and routing
- `postgres` - Database access and migration management
- `pulse` - AMQP message handling
- `monitor` - Metrics and monitoring
- `config` - Configuration loading and validation
- `loader` - Dependency injection
- `testing` - Test utilities

### Code Generation
The `yarn generate` command uses `infrastructure/tooling/src/generate` to:
- Generate API documentation from service definitions
- Generate client libraries from API schemas
- Update database schema documentation
- Ensure consistency across the monorepo

Output is deterministic to avoid spurious diffs.

### Build System
- Uses `console-taskgraph` to manage build tasks
- Builds a "monoimage" Docker container that can run any service
- Run any service with: `docker run <image> <service>/<process>`
- Example: `docker run <image> auth/web` or `docker run <image> queue/expireArtifacts`

### Client Libraries
Located in `clients/`, with support for:
- JavaScript (`client`) - auto-generated from API schemas
- Go (`client-go`) - auto-generated
- Python (`client-py`) - auto-generated
- Rust (`client-rust`) - auto-generated
- Shell (`client-shell`) - CLI tool
- Web (`client-web`) - Browser-compatible client

## Development Practices

### Testing Requirements
- Write tests for all changes (TDD preferred)
- Tests in `test/` directory, using Mocha
- Mock tests should work without credentials
- Some tests require credentials and will be skipped locally
- Use `TEST_DB_URL` for database-dependent tests

### Database Changes
When modifying the database:
1. Create a new version file in `db/versions/`
2. Include both migration and downgrade scripts
3. Update all affected stored functions
4. Deprecated functions must continue working for 2 major versions
5. Add test in `db/test/versions/` using `dbVersionTest`
6. Update `db/access.yml` if table access changes
7. Migrations must be fast; slow operations need online migrations

### API Changes
When modifying service APIs:
1. Update the API definition in the service
2. Run `yarn generate` to update docs and clients
3. Commit generated files with your changes

### Debugging
- Use `DEBUG=*` environment variable for verbose logging
- Services use the `debug` npm module for logging
- Check `procs.yml` for process definitions
- Use `NODE_ENV=development` when running services locally

## Important Constraints

### Requirements
- Node version: 24.12.0 (use nvm)
- Go version: go1.25.5 (use gvm) - only needed for `yarn generate`
- Postgres: 15
- Yarn: 4.12.0 (packageManager specified in package.json)

### Database Notes
- Test suites DROP and recreate the `public` schema
- Never run tests against a database with important data
- Postgres must be running for `yarn generate`

### Monorepo Structure
- Uses Yarn workspaces
- Workspaces: `libraries/*`, `services/*`, `db`
- Dependencies are linked, not published to npm during development

### Service Configuration
- Services use `taskcluster-lib-config` for configuration
- Configuration comes from: environment variables, config files, defaults
- `user-config.yml` can override settings locally (not committed)
- See `user-config-example.yml` for template

## Common Workflows

### Working on a Service
```bash
cd services/queue
yarn test                    # Run tests
export DEBUG=queue:*         # Enable service-specific logging
node src/main.js <process>   # Run a specific process
```

### Working on Database
```bash
yarn db:new                  # Create new migration
# Edit db/versions/XXXX.yml
yarn generate                # Update schema docs
yarn test                    # Run migration tests
```

### Working on UI
```bash
cd ui
yarn
export TASKCLUSTER_ROOT_URL=https://community-tc.services.mozilla.com
yarn start
# OR with local services:
# Terminal 1: yarn dev:start web-server-web
# Terminal 2: export TASKCLUSTER_ROOT_URL=http://localhost:5080 && yarn start
```

### Making a Pull Request
1. Run tests locally
2. Run `yarn generate` if you changed APIs or database
3. Run `yarn lint:fix` to fix style issues
4. Commit changes (including generated files)
5. CI will run full test suite and linting

## Tools and Workers

### Go Tools (in `tools/`)
- `worker-runner` - Runs workers in various cloud environments
- `websocktunnel` - WebSocket tunnel for workers
- `livelog` - Real-time log streaming
- `taskcluster-proxy` - Proxy for worker credential management
- `d2g` - Docker-to-Golang build tool
- `jsonschema2go` - JSON schema to Go struct generator

### Workers (in `workers/`)
- `docker-worker` - Runs tasks in Docker containers
- `generic-worker` - Cross-platform worker (supports Windows, macOS, Linux)

## Resources

- Main deployment: https://community-tc.services.mozilla.com
- RFCs: https://github.com/taskcluster/taskcluster-rfcs
- Retrospectives: https://github.com/taskcluster/taskcluster-retrospectives
- Documentation: See `dev-docs/` for architectural details
