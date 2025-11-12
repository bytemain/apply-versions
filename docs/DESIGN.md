# Design Document: apply-versions

## Overview

`apply-versions` is a CLI tool designed to manage version updates across multi-language monorepo projects. It automates version bumping, file updates, and Git operations (commits and tags) for packages written in different languages (npm, Go, Rust).

## Goals

1. **Unified Version Management**: Centralize version information in a single `versions.toml` file
2. **Multi-Language Support**: Handle npm (package.json), Go (go.mod), and Rust (Cargo.toml) packages
3. **Atomic Updates**: Commit each package update separately for clear history
4. **Git Tag Creation**: Automatically create appropriate Git tags for Go modules, including subpath support
5. **Safe Operation**: Support dry-run mode to preview changes before applying them

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────┐
│              CLI Entry Point                    │
│         (parse args, load config)               │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│           Config Parser                         │
│      (parse versions.toml using TOML)           │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────┐
│         Package Processor                       │
│  (iterate packages, apply version updates)      │
└────────────────┬────────────────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
┌────────▼──────┐  ┌────▼────────────────┐
│  File Updater │  │   Git Operations    │
│  (npm/go/cargo)│  │ (commit, tag)       │
└───────────────┘  └─────────────────────┘
```

### Component Details

#### 1. Config Parser
- **Input**: `versions.toml` file
- **Output**: Array of package configurations
- **Responsibilities**:
  - Parse TOML format
  - Validate required fields (path, name, type, version)
  - Validate package types against known types (npm, go, cargo)
  - Throw descriptive error for unknown package types
  - Validate semantic version format
  - Validate optional fields (e.g., update_workspace_deps for Rust)

#### 2. Package Processor
- **Input**: Parsed package configurations, CLI options
- **Output**: Update results and summary
- **Responsibilities**:
  - Iterate through each package
  - Orchestrate file updates and Git operations
  - Handle dry-run mode
  - Report success/failure for each package

#### 3. File Updater
- **Responsibilities**:
  - **npm**: Update `version` field in `package.json`
  - **Go**: Update `module` directive in `go.mod` (if version is part of path)
  - **Rust**: Update `version` field in `Cargo.toml`
  - Preserve file formatting as much as possible

#### 4. Git Operations
- **Responsibilities**:
  - Stage modified files for each package
  - Create commits with descriptive messages
  - Create Git tags for Go packages (with subpath support)
  - Handle errors gracefully (e.g., dirty working tree)

## Workflow

### Standard Workflow

```
1. Read versions.toml
2. Parse and validate configuration
3. For each package:
   a. Locate package directory
   b. Read current version from package file
   c. Compare with target version in versions.toml
   d. Collect changes (if version is different)
4. Display summary of planned changes
5. Prompt user for confirmation (unless --yes flag is used)
6. If confirmed, for each package:
   a. Update package file with new version
   b. Stage changes (git add)
   c. Commit changes with message
   d. Create Git tag (for Go packages)
7. Display final summary of changes
```

### Dry-Run Workflow

Same as standard workflow, but:
- Skip actual file writes
- Skip Git operations
- Skip confirmation prompt
- Display what would be changed

### Interactive Confirmation Workflow

Before applying any changes, the tool will:

1. **Analyze all packages**: Read current versions and compare with target versions
2. **Display change summary**: Show a detailed table of what will change
3. **Prompt for confirmation**: Ask user to proceed (unless `--yes` flag is used)
4. **Execute or abort**: Apply changes only if user confirms

**Example confirmation prompt**:
```
🔍 Analyzing packages...

The following packages will be updated:

┌────────────────────────────────────┬──────────┬──────────┬────────────┬──────┐
│ Package                            │ Type     │ Current  │ New        │ Tag  │
├────────────────────────────────────┼──────────┼──────────┼────────────┼──────┤
│ @myorg/web                         │ npm      │ 0.0.5    │ 0.0.6      │ No   │
│ github.com/org/repo/packages/api   │ go       │ 0.0.4    │ 0.0.5      │ Yes  │
│ github.com/org/repo/services/auth  │ go       │ 0.2.0    │ 0.2.1      │ Yes  │
│ myorg-server                       │ cargo    │ 0.24.10  │ 0.24.11    │ No   │
└────────────────────────────────────┴──────────┴──────────┴────────────┴──────┘

The following packages are already at target version and will be skipped:

  • myorg-core (cargo) - already at 0.2.0

Summary:
  • 4 packages will be updated
  • 1 package will be skipped
  • 4 commits will be created
  • 2 Git tags will be created (packages/api/v0.0.5, services/auth/v0.2.1)

❓ Do you want to proceed? [y/N]
```

## Configuration Format

### versions.toml Structure

```toml
[[package]]
path = "packages/api"                            # Relative path from repo root
name = "github.com/org/repo/packages/api"        # Package name/module name
type = "go"                                       # Package type: "npm" | "go" | "cargo"
version = "0.0.5"                                 # Target version

[[package]]
path = "packages/web"
name = "@myorg/web"
type = "npm"
version = "0.0.6"

[[package]]
path = "crates/server"
name = "myorg-server"
type = "cargo"
version = "0.24.11"
update_workspace_deps = true                      # Optional: update workspace dependencies
```

### Field Specifications

- **path** (required): Relative path from repository root to package directory
- **name** (required): Package identifier (used for commit messages and verification)
- **type** (required): Package type (`npm`, `go`, or `cargo`)
- **version** (required): Semantic version string (e.g., `1.2.3`)
- **update_workspace_deps** (optional, Rust only): If `true`, update other workspace members that depend on this crate (default: `false`)

## Git Tag Strategy

### npm Packages
- No automatic Git tags created
- Only file updates and commits

### Go Packages

#### Root-Level Packages
- **Tag format**: `v{version}`
- **Example**: `v0.0.5`

#### Subpath Packages
- **Tag format**: `{path}/v{version}`
- **Example**: `packages/api/v0.0.5`

#### Implementation Note
Go modules in subdirectories require the subpath prefix for proper module resolution. This follows the [official Go modules convention](https://go.dev/wiki/Modules#faqs--multi-module-repositories).

### Rust Packages
- Similar to npm, no automatic Git tags by default
- Could be added in future if needed

### Rust Workspace Handling

Rust monorepos often use Cargo workspaces where:
- Root `Cargo.toml` defines the workspace
- Each member crate has its own `Cargo.toml`
- Members can depend on each other

**Special considerations**:
1. **Individual Crate Updates**: Update version in member crate's `Cargo.toml`
2. **Dependency Updates**: When updating a workspace member, also update:
   - Other workspace members that depend on it
   - Their `Cargo.toml` dependencies section
3. **Root Cargo.toml**: May contain `[workspace.package]` with shared version (optional)

**Example Workspace Structure**:
```
rust-project/
├── Cargo.toml              # Workspace root
├── crate-a/
│   └── Cargo.toml          # Member: version = "1.0.0"
└── crate-b/
    └── Cargo.toml          # Member: version = "2.0.0", depends on crate-a
```

**Update Strategy**:
- Update crate's own version in its `Cargo.toml`
- Scan workspace for dependencies on this crate
- Update dependency versions to match (if using workspace-local path dependencies)

## Commit Strategy

### One Commit Per Package

Each package update gets its own commit for:
- **Clear history**: Easy to track when each package was updated
- **Selective reversion**: Can revert individual package updates
- **Better CI/CD**: Enables package-specific triggers

### Commit Message Format

```
chore({package-name}): bump version to {version}

- Updated {type} package at {path}
- Previous version: {old-version}
- New version: {new-version}
```

**Example**:
```
chore(@myorg/web): bump version to 0.0.6

- Updated npm package at packages/web
- Previous version: 0.0.5
- New version: 0.0.6
```

## CLI Interface

### Command

```bash
npx apply-versions [options]
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config` | `-c` | Path to versions.toml | `./versions.toml` |
| `--dry-run` | `-d` | Preview changes without applying | `false` |
| `--yes` | `-y` | Skip confirmation prompt and proceed automatically | `false` |
| `--verbose` | `-v` | Show detailed output | `false` |
| `--help` | `-h` | Display help message | - |
| `--version` | - | Show tool version | - |

### Usage Examples

```bash
# Apply versions from default config (will prompt for confirmation)
npx apply-versions

# Dry run to preview changes (no confirmation needed)
npx apply-versions --dry-run

# Skip confirmation prompt (CI/CD mode)
npx apply-versions --yes

# Use custom config file
npx apply-versions --config ./my-versions.toml

# Verbose output for debugging
npx apply-versions --verbose --dry-run

# Auto-confirm with verbose output
npx apply-versions --yes --verbose
```

## Error Handling

### Pre-flight Checks

Before making any changes:
1. Verify `versions.toml` exists and is valid
2. Check if Git repository exists
3. Warn if working tree is dirty (uncommitted changes)
4. Validate all package paths exist
5. Validate all package files exist (package.json, go.mod, Cargo.toml)

### Error Recovery

- **File not found**: Skip package with error message
- **Invalid version format**: Skip package with error message
- **Unknown package type**: Fail fast with error listing valid types
- **Git operation failure**: Stop processing, report which packages were updated
- **Parse error**: Fail fast with clear error message

### Validation Errors

**Unknown package type**:
```
❌ Error: Invalid package type 'python' for package at path 'services/api'
  Valid types are: npm, go, cargo
```

**Invalid version format**:
```
❌ Error: Invalid version '1.2' for package at path 'services/api'
  Version must follow semantic versioning format: major.minor.patch (e.g., 1.2.3)
```

**Missing required field**:
```
❌ Error: Missing required field 'version' for package at path 'services/api'
```

### Exit Codes

- `0`: Success (all packages updated)
- `1`: Partial failure (some packages failed)
- `2`: Total failure (configuration or pre-flight check failed)
- `3`: User cancelled (declined confirmation prompt)

## Output Format

### Standard Output

```
🔍 Reading configuration from versions.toml
✓ Found 5 packages to process
� Analyzing current versions...

The following packages will be updated:

┌────────────────────────────────────┬──────────┬──────────┬────────────┬──────┐
│ Package                            │ Type     │ Current  │ New        │ Tag  │
├────────────────────────────────────┼──────────┼──────────┼────────────┼──────┤
│ @myorg/web                         │ npm      │ 0.0.5    │ 0.0.6      │ No   │
│ github.com/org/repo/packages/api   │ go       │ 0.0.4    │ 0.0.5      │ Yes  │
└────────────────────────────────────┴──────────┴──────────┴────────────┴──────┘

The following packages are already at target version:

  • myorg-server (cargo) - 0.24.11

Summary:
  • 2 packages will be updated
  • 1 package will be skipped
  • 2 commits will be created
  • 1 Git tag will be created

❓ Do you want to proceed? [y/N] y

📦 Processing @myorg/web (npm)
  Current version: 0.0.5
  Target version:  0.0.6
  ✓ Updated package.json
  ✓ Committed changes

📦 Processing packages/api (go)
  Current version: 0.0.4
  Target version:  0.0.5
  ✓ Updated go.mod
  ✓ Committed changes
  ✓ Created tag: packages/api/v0.0.5

⊘ Skipping crates/server (cargo)
  Already at target version: 0.24.11

✅ Summary:
  - 2 packages updated
  - 1 package skipped (no change needed)
  - 2 commits created
  - 1 tag created
```

### Dry-Run Output

```
🔍 [DRY RUN] Reading configuration from versions.toml
✓ Found 5 packages to process

📦 [DRY RUN] Would process packages/api (go)
  Current version: 0.0.4
  Target version:  0.0.5
  ⊘ Would update go.mod
  ⊘ Would commit changes
  ⊘ Would create tag: packages/api/v0.0.5

...

✅ [DRY RUN] Summary:
  - 2 packages would be updated
  - 1 package would be skipped
  - 2 commits would be created
  - 1 tag would be created
  
No changes were made.
```

## Implementation Considerations

### Code Architecture & Design Patterns

#### 1. Strategy Pattern - Package Updaters

Use the **Strategy Pattern** for different package type handlers:

```typescript
// Base interface
interface PackageUpdater {
  readonly type: PackageType;
  readVersion(packagePath: string): Promise<string>;
  updateVersion(packagePath: string, newVersion: string): Promise<void>;
  validatePackage(packagePath: string): Promise<boolean>;
}

// Concrete implementations
class NpmPackageUpdater implements PackageUpdater {
  readonly type = 'npm';
  async readVersion(packagePath: string): Promise<string> { /* ... */ }
  async updateVersion(packagePath: string, newVersion: string): Promise<void> { /* ... */ }
  async validatePackage(packagePath: string): Promise<boolean> { /* ... */ }
}

class GoPackageUpdater implements PackageUpdater { /* ... */ }
class RustPackageUpdater implements PackageUpdater { /* ... */ }

// Factory to get the right updater
class PackageUpdaterFactory {
  private static updaters = new Map<PackageType, PackageUpdater>([
    ['npm', new NpmPackageUpdater()],
    ['go', new GoPackageUpdater()],
    ['cargo', new RustPackageUpdater()],
  ]);

  static getUpdater(type: PackageType): PackageUpdater {
    const updater = this.updaters.get(type);
    if (!updater) {
      throw new Error(
        `Unknown package type: ${type}. Valid types are: ${Array.from(this.updaters.keys()).join(', ')}`
      );
    }
    return updater;
  }

  static getSupportedTypes(): PackageType[] {
    return Array.from(this.updaters.keys());
  }
}
```

**Benefits**:
- Easy to add new package types (just implement interface and register)
- Type-specific logic is encapsulated
- Factory centralizes type validation
- Single source of truth for supported types

#### 2. Builder Pattern - Git Operations

Use **Builder Pattern** for constructing Git operations:

```typescript
class GitOperationBuilder {
  private files: string[] = [];
  private message: string = '';
  private tag?: string;

  addFile(filePath: string): this {
    this.files.push(filePath);
    return this;
  }

  withMessage(message: string): this {
    this.message = message;
    return this;
  }

  withTag(tag: string): this {
    this.tag = tag;
    return this;
  }

  async execute(dryRun: boolean): Promise<GitOperationResult> {
    if (dryRun) {
      return this.simulateExecution();
    }
    return this.performExecution();
  }
}
```

**Benefits**:
- Fluent API for complex Git operations
- Easy to add dry-run mode
- Clear separation of building and execution

#### 3. Chain of Responsibility - Validation Pipeline

Use **Chain of Responsibility** for validation:

```typescript
abstract class ValidationHandler {
  protected next?: ValidationHandler;

  setNext(handler: ValidationHandler): ValidationHandler {
    this.next = handler;
    return handler;
  }

  async validate(config: PackageConfig): Promise<ValidationResult> {
    const result = await this.doValidate(config);
    if (!result.valid || !this.next) {
      return result;
    }
    return this.next.validate(config);
  }

  protected abstract doValidate(config: PackageConfig): Promise<ValidationResult>;
}

class RequiredFieldsValidator extends ValidationHandler {
  protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
    const required = ['path', 'name', 'type', 'version'];
    for (const field of required) {
      if (!config[field]) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
    return { valid: true };
  }
}

class PackageTypeValidator extends ValidationHandler {
  protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
    const validTypes = PackageUpdaterFactory.getSupportedTypes();
    if (!validTypes.includes(config.type)) {
      return {
        valid: false,
        error: `Invalid package type: ${config.type}. Valid types are: ${validTypes.join(', ')}`,
      };
    }
    return { valid: true };
  }
}

class VersionFormatValidator extends ValidationHandler {
  private readonly semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

  protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
    if (!this.semverRegex.test(config.version)) {
      return {
        valid: false,
        error: `Invalid version format: ${config.version}. Must follow semver (e.g., 1.2.3)`,
      };
    }
    return { valid: true };
  }
}

class PathExistsValidator extends ValidationHandler {
  protected async doValidate(config: PackageConfig): Promise<ValidationResult> {
    const exists = await fs.access(config.path).then(() => true).catch(() => false);
    if (!exists) {
      return { valid: false, error: `Path does not exist: ${config.path}` };
    }
    return { valid: true };
  }
}

// Setup validation chain
const validator = new RequiredFieldsValidator();
validator
  .setNext(new PackageTypeValidator())
  .setNext(new VersionFormatValidator())
  .setNext(new PathExistsValidator());
```

**Benefits**:
- Easy to add/remove/reorder validations
- Each validator has single responsibility
- Clear error messages at each step

#### 4. Command Pattern - Package Operations

Use **Command Pattern** for package update operations:

```typescript
interface Command {
  execute(): Promise<void>;
  undo(): Promise<void>;
  describe(): string;
}

class UpdatePackageCommand implements Command {
  constructor(
    private package: PackageConfig,
    private updater: PackageUpdater,
    private gitOps: GitOperations,
    private dryRun: boolean
  ) {}

  async execute(): Promise<void> {
    if (this.dryRun) {
      console.log(`[DRY RUN] Would update ${this.package.name}`);
      return;
    }

    await this.updater.updateVersion(this.package.path, this.package.version);
    await this.gitOps.stageAndCommit(this.package);
  }

  async undo(): Promise<void> {
    // Revert Git commit
    await this.gitOps.revertLastCommit();
  }

  describe(): string {
    return `Update ${this.package.name} to ${this.package.version}`;
  }
}

// Command invoker
class PackageProcessor {
  private commands: Command[] = [];
  private executed: Command[] = [];

  addCommand(command: Command): void {
    this.commands.push(command);
  }

  async executeAll(): Promise<void> {
    for (const command of this.commands) {
      try {
        await command.execute();
        this.executed.push(command);
      } catch (error) {
        console.error(`Failed to execute: ${command.describe()}`);
        // Option to rollback all executed commands
        await this.rollback();
        throw error;
      }
    }
  }

  async rollback(): Promise<void> {
    for (const command of this.executed.reverse()) {
      await command.undo();
    }
  }
}
```

**Benefits**:
- Encapsulates operations as objects
- Easy to implement undo/rollback
- Supports dry-run mode naturally
- Command history for logging

#### 5. Repository Pattern - File Operations

Use **Repository Pattern** for file access:

```typescript
interface FileRepository {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

class LocalFileRepository implements FileRepository {
  async read(path: string): Promise<string> {
    return await fs.readFile(path, 'utf-8');
  }

  async write(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, 'utf-8');
  }

  async exists(path: string): Promise<boolean> {
    return await fs.access(path).then(() => true).catch(() => false);
  }
}

// Mock for testing
class MockFileRepository implements FileRepository {
  private files = new Map<string, string>();

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}
```

**Benefits**:
- Abstracts file system operations
- Easy to mock for testing
- Can implement different storage backends

#### 6. Observer Pattern - Progress Reporting

Use **Observer Pattern** for progress updates:

```typescript
interface ProgressObserver {
  onAnalysisStart(packageCount: number): void;
  onAnalysisComplete(changes: PackageChange[]): void;
  onConfirmationPrompt(summary: ChangeSummary): Promise<boolean>;
  onPackageStart(pkg: PackageConfig): void;
  onPackageComplete(pkg: PackageConfig, result: UpdateResult): void;
  onPackageSkipped(pkg: PackageConfig, reason: string): void;
  onComplete(summary: Summary): void;
}

class ConsoleProgressObserver implements ProgressObserver {
  onAnalysisStart(packageCount: number): void {
    console.log(`🔍 Analyzing ${packageCount} packages...`);
  }

  onAnalysisComplete(changes: PackageChange[]): void {
    this.displayChangesTable(changes);
  }

  async onConfirmationPrompt(summary: ChangeSummary): Promise<boolean> {
    this.displaySummary(summary);
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    return new Promise((resolve) => {
      readline.question('❓ Do you want to proceed? [y/N] ', (answer: string) => {
        readline.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  onPackageStart(pkg: PackageConfig): void {
    console.log(`📦 Processing ${pkg.name} (${pkg.type})`);
  }

  onPackageComplete(pkg: PackageConfig, result: UpdateResult): void {
    console.log(`  ✓ Updated ${pkg.type} package at ${pkg.path}`);
  }

  onPackageSkipped(pkg: PackageConfig, reason: string): void {
    console.log(`  ⊘ Skipped: ${reason}`);
  }

  onComplete(summary: Summary): void {
    console.log(`\n✅ Summary:`);
    console.log(`  - ${summary.updated} packages updated`);
    console.log(`  - ${summary.skipped} packages skipped`);
  }

  private displayChangesTable(changes: PackageChange[]): void {
    // Display table of changes (using cli-table3 or similar)
  }

  private displaySummary(summary: ChangeSummary): void {
    console.log(`\nSummary:`);
    console.log(`  • ${summary.toUpdate} packages will be updated`);
    console.log(`  • ${summary.toSkip} packages will be skipped`);
    console.log(`  • ${summary.commits} commits will be created`);
    if (summary.tags.length > 0) {
      console.log(`  • ${summary.tags.length} Git tags will be created`);
    }
  }
}
```

**Benefits**:
- Decouples progress reporting from business logic
- Easy to add multiple reporters (console, file, HTTP)
- Clean separation of concerns
- Supports interactive prompts

#### 7. Type Safety

Use TypeScript strictly:

```typescript
// Literal types for package types
type PackageType = 'npm' | 'go' | 'cargo';

// Discriminated unions for package configs
type PackageConfig = 
  | { type: 'npm'; path: string; name: string; version: string }
  | { type: 'go'; path: string; name: string; version: string }
  | { type: 'cargo'; path: string; name: string; version: string; update_workspace_deps?: boolean };

// Result types
type UpdateResult = 
  | { success: true; oldVersion: string; newVersion: string }
  | { success: false; error: string };

// Type guards
function isCargoPackage(config: PackageConfig): config is Extract<PackageConfig, { type: 'cargo' }> {
  return config.type === 'cargo';
}
```

**Benefits**:
- Compile-time type checking
- Better IDE autocomplete
- Prevents runtime type errors
- Self-documenting code

### Code Organization

```
src/
├── index.ts                    # CLI entry point
├── types/                      # Type definitions
│   ├── config.ts
│   ├── package.ts
│   └── result.ts
├── parsers/                    # Config parser
│   └── toml-parser.ts
├── validators/                 # Validation chain
│   ├── base-validator.ts
│   ├── required-fields.ts
│   ├── package-type.ts
│   ├── version-format.ts
│   └── path-exists.ts
├── updaters/                   # Package updaters (Strategy)
│   ├── base-updater.ts
│   ├── npm-updater.ts
│   ├── go-updater.ts
│   ├── rust-updater.ts
│   └── factory.ts
├── git/                        # Git operations
│   ├── git-operations.ts
│   └── git-builder.ts
├── commands/                   # Commands (Command pattern)
│   ├── base-command.ts
│   └── update-package.ts
├── processors/                 # Main processor
│   └── package-processor.ts
├── observers/                  # Progress observers
│   ├── base-observer.ts
│   └── console-observer.ts
├── repositories/               # File operations
│   ├── file-repository.ts
│   └── local-repository.ts
└── utils/                      # Utilities
    ├── logger.ts
    └── version-utils.ts
```

### SOLID Principles Application

1. **Single Responsibility**: Each class has one reason to change
   - `NpmPackageUpdater` only handles npm packages
   - `GitOperations` only handles Git
   - `ConfigParser` only parses config

2. **Open/Closed**: Open for extension, closed for modification
   - New package types: implement `PackageUpdater` interface
   - New validators: extend `ValidationHandler`
   - No need to modify existing code

3. **Liskov Substitution**: Subtypes must be substitutable
   - All `PackageUpdater` implementations work the same way
   - Can swap `LocalFileRepository` with `MockFileRepository`

4. **Interface Segregation**: Many specific interfaces over one general
   - `PackageUpdater`, `GitOperations`, `FileRepository` are separate
   - Clients depend only on what they need

5. **Dependency Inversion**: Depend on abstractions, not concretions
   - `PackageProcessor` depends on `PackageUpdater` interface
   - Concrete implementations injected via factory/DI

## Implementation Considerations

### Dependencies

- **TOML parser**: `@iarna/toml` or `smol-toml`
- **Git operations**: `simple-git`
- **CLI framework**: `commander` or `yargs`
- **File operations**: Node.js `fs/promises`
- **User prompts**: `readline` (built-in) or `prompts` / `inquirer`
- **Table formatting**: `cli-table3` or `table` for displaying change summaries

### File Parsing

#### package.json (npm)
- Parse as JSON
- Update `version` field
- Stringify with proper formatting (2-space indent)

#### go.mod (Go)
- Text-based parsing (regex or line-by-line)
- May need to update module path if version is in path (v2+)
- Preserve file format

#### Cargo.toml (Rust)
- Use TOML parser
- Update `[package].version` field
- Preserve formatting
- **Workspace support**: 
  - Detect if package is part of a Cargo workspace
  - Update version in member's `Cargo.toml`
  - Optionally update workspace dependencies that reference this crate
  - Handle both path dependencies and version specifications

### Testing Strategy

1. **Unit tests**: Individual component testing
2. **Integration tests**: End-to-end workflow with mock Git repo
3. **Snapshot tests**: Verify file output format
4. **Error case tests**: Handle various failure scenarios

## Future Enhancements

1. **Interactive mode**: Prompt user to select packages to update
2. **Version bump helpers**: Commands like `--major`, `--minor`, `--patch`
3. **Changelog generation**: Auto-generate CHANGELOG.md entries
4. **Pre/post hooks**: Run custom scripts before/after updates
5. **Workspace awareness**: Auto-detect monorepo structure
6. **Rollback command**: Undo last version update
7. **Rust tag support**: Optional Git tags for Rust crates
8. **Dependency updates**: Update cross-package dependencies automatically
9. **Rust workspace intelligence**: 
   - Auto-detect workspace members
   - Suggest updating dependent crates when a dependency is updated
   - Validate workspace dependency graph
10. **npm workspace support**: Similar support for npm/pnpm/yarn workspaces
11. **Parallel processing**: Process independent packages concurrently (with sequential commits)

## Security Considerations

1. **Input validation**: Sanitize all user inputs and file paths
2. **Path traversal**: Prevent access outside repository root
3. **Command injection**: Safely execute Git commands
4. **File permissions**: Verify write permissions before modifying files

## Performance

- **Sequential processing**: Process packages one at a time (required for atomic commits)
- **File I/O**: Minimize disk operations, read files only once
- **Git operations**: Batch where possible (e.g., stage multiple files before commit)

## Compatibility

- **Node.js**: Requires Node.js 18.x or higher (ESM support)
- **Git**: Requires Git 2.x or higher
- **OS**: Cross-platform (Windows, macOS, Linux)
