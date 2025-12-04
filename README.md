# apply-versions

[![npm version](https://badge.fury.io/js/apply-versions.svg)](https://www.npmjs.com/package/apply-versions)

A CLI tool for managing versions across multi-language monorepo projects. Automatically update versions in npm, Go, and Rust packages, with atomic Git commits and tag creation.

## Features

- 🎯 **Unified Version Management**: Single `versions.toml` file for all packages
- 🌐 **Multi-Language Support**: npm (package.json), Go (go.mod), and Rust (Cargo.toml)
- 🔒 **Atomic Commits**: One commit per package update for clear history
- 🏷️ **Smart Git Tags**: Automatic tag creation for Go modules with subpath support
- 🔍 **Dry Run Mode**: Preview changes before applying them
- ✨ **Zero Config**: Works out of the box with sensible defaults
- 📦 **Bump Command**: Quick version bumping from any subdirectory
- 🔍 **Auto-Discovery**: Finds `versions.toml` by searching upward from current directory

## Installation

```bash
npm install -g apply-versions
```

Or use directly with npx:

```bash
npx apply-versions
```

## Quick Start

1. Create a `versions.toml` file in your repository root:

```toml
[[package]]
path = "packages/core"
name = "@myorg/core"
type = "npm"
version = "1.2.3"

[[package]]
path = "go-service"
name = "go-service"
type = "go"
version = "0.5.0"

[[package]]
path = "rust-lib"
name = "myorg-rust-lib"
type = "cargo"
version = "2.1.0"
```

2. Run the tool:

```bash
# Apply all versions
npx apply-versions

# Or bump a package version from its directory
cd packages/core
npx apply-versions bump patch  # 1.2.3 -> 1.2.4
```

3. Review the changes and confirm when prompted

4. Done! Your packages are updated, committed, and tagged.

## Usage

### Apply Command (Update all packages to specified versions)

```bash
# Apply versions from default config (./versions.toml)
# Will show changes and prompt for confirmation
npx apply-versions

# Preview changes without modifying files (dry run)
npx apply-versions --dry-run

# Skip confirmation prompt (useful for CI/CD)
npx apply-versions --yes

# Use a custom configuration file
npx apply-versions --config ./my-versions.toml

# Run from a subdirectory (auto-filters packages)
cd packages
npx apply-versions  # Only updates packages under packages/

# Specify a path to filter packages
npx apply-versions --path packages/core

# Verbose output for debugging
npx apply-versions --verbose
```

### Bump Command (Quick version bumping)

```bash
# Navigate to a package directory
cd packages/core

# Interactive mode - select version type with arrow keys
npx apply-versions bump

# Or directly specify the bump type
# Bump patch version (1.2.3 -> 1.2.4)
npx apply-versions bump patch

# Bump minor version (1.2.3 -> 1.3.0)
npx apply-versions bump minor

# Bump major version (1.2.3 -> 2.0.0)
npx apply-versions bump major

# Bump prerelease version (1.2.3 -> 1.2.4-alpha.0)
npx apply-versions bump prerelease

# Skip confirmation
npx apply-versions bump patch --yes

# Works from subdirectories too
cd packages/core/src
npx apply-versions bump patch  # Automatically finds and bumps core package
```

**Interactive mode**: When you run `bump` without specifying a type, an interactive menu appears:
- Use arrow keys to select: Patch, Minor, Major, or Prerelease
- If Prerelease is selected, you'll be prompted to enter an identifier (e.g., alpha, beta, rc)

The `bump` command:
1. Finds `versions.toml` by searching upward
2. Identifies the package(s) in current directory
3. Prompts for version type (if not specified)
4. Calculates new version based on bump type
5. Updates `versions.toml`
6. Applies the changes (updates files, creates commit)

See [BUMP.md](docs/BUMP.md) for detailed usage examples.

### Command Line Options

**Apply Command:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Path to versions.toml configuration file | Auto-search upward |
| `--path <path>` | `-p` | Only process packages under this path | All packages |
| `--dry-run` | `-d` | Preview changes without applying them | `false` |
| `--yes` | `-y` | Skip confirmation prompt and proceed automatically | `false` |
| `--verbose` | `-v` | Show detailed output and debug information | `false` |

**Bump Command:**

```bash
apply-versions bump [type] [options]
```

Where `[type]` is optional and can be: `patch`, `minor`, `major`, or `prerelease`. If not specified, an interactive prompt will be shown.

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config <path>` | `-c` | Path to versions.toml configuration file | Auto-search upward |
| `--yes` | `-y` | Skip confirmation prompt | `false` |
| `--verbose` | `-v` | Show detailed output | `false` |

## Configuration

### versions.toml Format

The configuration file uses TOML format with an array of package definitions:

```toml
[[package]]
path = "relative/path/to/package"  # Required: Path from repo root
name = "package-name"               # Required: Package identifier
type = "npm"                        # Required: "npm" | "go" | "cargo"
version = "1.0.0"                   # Required: Semantic version

[[package]]
path = "another/package"
name = "another-package"
type = "go"
version = "2.3.4"
```

### Field Reference

#### `path` (required)
Relative path from the repository root to the package directory.

**Examples**:
- `"packages/core"` - npm package in packages directory
- `"services/api"` - Go module in services directory
- `"libs/utils"` - Rust crate in libs directory

#### `name` (required)
The package name or module name. Used for:
- Verification (must match the name in package file)
- Commit messages
- Display output

**Examples**:
- npm: `"@myorg/package"` or `"my-package"`
- Go: `"github.com/user/repo/module"`
- Rust: `"my-crate"`

#### `type` (required)
Package type. Determines which file to update and how to process it.

**Valid values**:
- `"npm"` - Updates `package.json`
- `"go"` - Updates `go.mod`
- `"cargo"` - Updates `Cargo.toml`

#### `version` (required)
Target semantic version to set for the package.

**Format**: `major.minor.patch` (e.g., `"1.2.3"`)

#### `update_workspace_deps` (optional, Rust only)
For Rust packages in a Cargo workspace, whether to update other workspace members that depend on this crate.

**Valid values**: `true` or `false` (default: `false`)

**Example**:
```toml
[[package]]
path = "crates/core"
name = "myorg-core"
type = "cargo"
version = "2.0.0"
update_workspace_deps = true  # Update other crates that depend on myorg-core
```

#### `create_tag` (optional, npm and Rust only)
Whether to create a Git tag when applying version changes. By default, tags are created for all package types.

**Valid values**: `true` or `false` (default: `true`)

**Example**:
```toml
# npm package without tag creation
[[package]]
path = "packages/internal-tool"
name = "@myorg/internal-tool"
type = "npm"
version = "0.1.0"
create_tag = false  # Skip Git tag creation for internal packages

# Rust package with tag creation (default behavior)
[[package]]
path = "crates/api"
name = "myorg-api"
type = "cargo"
version = "1.0.0"
create_tag = true  # Explicitly enable Git tag creation
```

## How It Works

### Update Process

For each package in `versions.toml`:

1. **Analyze Phase**:
   - Locate package directory using the `path` field
   - Read current version from the package file
   - Compare with target version in versions.toml
   - Collect all changes

2. **Confirmation Phase**:
   - Display a detailed table of all pending changes
   - Show which packages will be updated and which will be skipped
   - List all Git tags that will be created
   - Prompt user for confirmation (unless `--yes` flag is used)

3. **Execution Phase** (if confirmed):
   - Update file with new version
   - Stage the modified file with Git
   - Create a commit with descriptive message
   - Create Git tags (for Go packages)
   - Repeat for each package

4. **Summary**:
   - Display final summary of all changes made

### Git Tag Strategy

#### npm and Rust Packages
By default, Git tags are created with format `v{version}` (e.g., `v1.2.3`). You can disable tag creation by setting `create_tag = false` in the package configuration.

```toml
[[package]]
type = "npm"
path = "packages/core"
name = "@myorg/core"
version = "1.2.3"
create_tag = false  # No Git tag will be created
```

#### Go Packages

**Root-level packages** (path at repository root):
```
Tag format: v{version}
Example: v1.2.3
```

**Subpath packages** (nested directories):
```
Tag format: {path}/v{version}
Example: services/api/v1.2.3
```

This follows the [official Go modules convention](https://go.dev/wiki/Modules#faqs--multi-module-repositories) for multi-module repositories.

### Commit Messages

Each package update creates a separate commit with this format:

```
chore({package-name}): bump version to {version}

- Updated {type} package at {path}
- Previous version: {old-version}
- New version: {new-version}
```

**Example**:
```
chore(@myorg/core): bump version to 1.2.3

- Updated npm package at packages/core
- Previous version: 1.2.2
- New version: 1.2.3
```

## Examples

### Complete Example: Multi-Language Monorepo

Repository structure:
```
my-monorepo/
├── versions.toml
├── packages/
│   ├── web/
│   │   └── package.json          # npm package
│   └── cli/
│       └── package.json          # npm package
├── services/
│   ├── auth/
│   │   └── go.mod                # Go module
│   └── api/
│       └── go.mod                # Go module
└── crates/
    ├── core/
    │   └── Cargo.toml            # Rust crate
    └── utils/
        └── Cargo.toml            # Rust crate
```

Configuration (`versions.toml`):
```toml
[[package]]
path = "packages/web"
name = "@myorg/web"
type = "npm"
version = "2.1.0"

[[package]]
path = "packages/cli"
name = "@myorg/cli"
type = "npm"
version = "1.5.3"

[[package]]
path = "services/auth"
name = "auth"
type = "go"
version = "0.8.0"

[[package]]
path = "services/api"
name = "api"
type = "go"
version = "1.0.0"

[[package]]
path = "crates/core"
name = "myorg-core"
type = "cargo"
version = "3.2.1"

[[package]]
path = "crates/utils"
name = "myorg-utils"
type = "cargo"
version = "2.0.0"
```

Run the tool:
```bash
npx apply-versions
```

Output:
```
🔍 Reading configuration from versions.toml
✓ Found 6 packages to process
� Analyzing current versions...

The following packages will be updated:

┌────────────────────────────────────┬──────────┬──────────┬────────────┬──────┐
│ Package                            │ Type     │ Current  │ New        │ Tag  │
├────────────────────────────────────┼──────────┼──────────┼────────────┼──────┤
│ @myorg/web                         │ npm      │ 2.0.9    │ 2.1.0      │ No   │
│ github.com/.../services/auth       │ go       │ 0.7.5    │ 0.8.0      │ Yes  │
│ github.com/.../services/api        │ go       │ 0.9.2    │ 1.0.0      │ Yes  │
│ myorg-core                         │ rust     │ 3.2.0    │ 3.2.1      │ No   │
└────────────────────────────────────┴──────────┴──────────┴────────────┴──────┘

The following packages are already at target version:

  • @myorg/cli (npm) - 1.5.3
  • myorg-utils (rust) - 2.0.0

Summary:
  • 4 packages will be updated
  • 2 packages will be skipped
  • 4 commits will be created
  • 2 Git tags will be created (services/auth/v0.8.0, services/api/v1.0.0)

❓ Do you want to proceed? [y/N] y

📦 Processing @myorg/web (npm)
  Current version: 2.0.9
  Target version:  2.1.0
  ✓ Updated package.json
  ✓ Committed changes

📦 Processing @myorg/cli (npm)
  ⊘ Already at target version: 1.5.3

📦 Processing github.com/myorg/monorepo/services/auth (go)
  Current version: 0.7.5
  Target version:  0.8.0
  ✓ Updated go.mod
  ✓ Committed changes
  ✓ Created tag: services/auth/v0.8.0

📦 Processing github.com/myorg/monorepo/services/api (go)
  Current version: 0.9.2
  Target version:  1.0.0
  ✓ Updated go.mod
  ✓ Committed changes
  ✓ Created tag: services/api/v1.0.0

📦 Processing myorg-core (rust)
  Current version: 3.2.0
  Target version:  3.2.1
  ✓ Updated Cargo.toml
  ✓ Committed changes

📦 Processing myorg-utils (rust)
  ⊘ Already at target version: 2.0.0

✅ Summary:
  - 4 packages updated
  - 2 packages skipped (no change needed)
  - 4 commits created
  - 2 tags created
```

### Skip Confirmation (CI/CD Mode)

For automated environments, use the `--yes` flag:

```bash
npx apply-versions --yes
```

This will skip the confirmation prompt and apply all changes automatically.

### Dry Run Example

Preview changes before applying:

```bash
npx apply-versions --dry-run
```

Output:
```
🔍 [DRY RUN] Reading configuration from versions.toml
✓ Found 6 packages to process

📦 [DRY RUN] Would process @myorg/web (npm)
  Current version: 2.0.9
  Target version:  2.1.0
  ⊘ Would update package.json
  ⊘ Would commit with message: "chore(@myorg/web): bump version to 2.1.0"

📦 [DRY RUN] Would process github.com/myorg/monorepo/services/auth (go)
  Current version: 0.7.5
  Target version:  0.8.0
  ⊘ Would update go.mod
  ⊘ Would commit with message: "chore(services/auth): bump version to 0.8.0"
  ⊘ Would create tag: services/auth/v0.8.0

...

✅ [DRY RUN] Summary:
  - 4 packages would be updated
  - 2 packages would be skipped
  - 4 commits would be created
  - 2 tags created

No changes were made. Run without --dry-run to apply changes.
```

### Rust Workspace Example

Rust projects often use Cargo workspaces where multiple crates can depend on each other:

**Repository structure**:
```
rust-monorepo/
├── versions.toml
├── Cargo.toml              # Workspace root
├── crates/
│   ├── core/
│   │   └── Cargo.toml      # name = "myorg-core", version = "1.0.0"
│   ├── utils/
│   │   └── Cargo.toml      # name = "myorg-utils", version = "1.0.0"
│   └── app/
│       └── Cargo.toml      # name = "myorg-app", depends on core and utils
```

**Workspace root Cargo.toml**:
```toml
[workspace]
members = ["crates/*"]
resolver = "2"
```

**crates/app/Cargo.toml** (depends on other workspace members):
```toml
[package]
name = "myorg-app"
version = "2.0.0"

[dependencies]
myorg-core = { path = "../core", version = "1.0.0" }
myorg-utils = { path = "../utils", version = "1.0.0" }
```

**Configuration (versions.toml)**:
```toml
# Update core and propagate to dependents
[[package]]
path = "crates/core"
name = "myorg-core"
type = "cargo"
version = "2.0.0"
update_workspace_deps = true  # Will update myorg-app's dependency on core

# Update utils independently
[[package]]
path = "crates/utils"
name = "myorg-utils"
type = "cargo"
version = "1.5.0"
update_workspace_deps = true

# Update app
[[package]]
path = "crates/app"
name = "myorg-app"
type = "cargo"
version = "2.1.0"
```

**What happens**:
1. Updates `myorg-core` version to `2.0.0` in `crates/core/Cargo.toml`
2. Because `update_workspace_deps = true`, also updates `myorg-app`'s dependency:
   ```toml
   myorg-core = { path = "../core", version = "2.0.0" }  # Updated from 1.0.0
   ```
3. Each update gets its own commit
4. Dependency updates are mentioned in commit messages

**Output**:
```
📦 Processing myorg-core (rust)
  Current version: 1.0.0
  Target version:  2.0.0
  ✓ Updated crates/core/Cargo.toml
  ✓ Updated workspace dependencies:
    - myorg-app: 1.0.0 → 2.0.0
  ✓ Committed changes

📦 Processing myorg-utils (rust)
  Current version: 1.0.0
  Target version:  1.5.0
  ✓ Updated crates/utils/Cargo.toml
  ✓ Updated workspace dependencies:
    - myorg-app: 1.0.0 → 1.5.0
  ✓ Committed changes

📦 Processing myorg-app (rust)
  Current version: 2.0.0
  Target version:  2.1.0
  ✓ Updated crates/app/Cargo.toml
  ✓ Committed changes
```

## Error Handling

### Pre-flight Checks

Before making any changes, the tool verifies:
- ✓ `versions.toml` exists and is valid TOML
- ✓ Git repository exists
- ✓ All package directories exist
- ✓ All package files exist (package.json, go.mod, Cargo.toml)

If the working tree has uncommitted changes, a warning is displayed but execution continues.

### Error Scenarios

**Configuration errors**: Invalid TOML or missing required fields
```
❌ Error: Invalid configuration
  - Missing required field 'version' for package at path 'services/auth'
```

**Unknown package type**:
```
❌ Error: Invalid package type 'python' for package at path 'services/api'
  Valid types are: npm, go, rust
```

**Invalid version format**:
```
❌ Error: Invalid version format '1.2' for package 'myorg-core'
  Version must follow semantic versioning format: major.minor.patch (e.g., 1.2.3)
```

**Missing package file**:
```
⚠ Skipping github.com/myorg/service (go)
  Error: go.mod not found at services/missing/go.mod
```

**Git operation failure**:
```
❌ Error: Failed to create commit for @myorg/web
  Git error: fatal: pathspec 'package.json' did not match any files
```

### Exit Codes

- `0` - Success (all packages updated)
- `1` - Partial failure (some packages failed, others succeeded)
- `2` - Total failure (configuration error or pre-flight check failed)
- `3` - User cancelled (declined confirmation prompt)

## Development

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

### Development Mode

Watch for changes and rebuild:

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Linting and Formatting

```bash
npm run lint
npm run format
```

## Requirements

- **Node.js**: 18.x or higher
- **Git**: 2.x or higher
- **OS**: Cross-platform (Windows, macOS, Linux)

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Related Projects

- [changesets](https://github.com/changesets/changesets) - Version management for npm packages
- [lerna](https://github.com/lerna/lerna) - Monorepo management tool
- [release-it](https://github.com/release-it/release-it) - Generic release tool

## See Also

- [DESIGN.md](./DESIGN.md) - Detailed design documentation and architecture
- [Go Modules in Multi-Module Repositories](https://go.dev/wiki/Modules#faqs--multi-module-repositories)
- [Semantic Versioning](https://semver.org/)

