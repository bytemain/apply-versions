# Bump Command Usage

## 功能特性

`bump` 命令允许你在子目录中快速升级版本号，自动更新 `versions.toml` 并应用更改。支持交互式选择和预发布版本。

## 基本用法

```bash
# 在包目录中执行
cd packages/service-a

# 交互式选择版本类型
apply-versions bump

# 或直接指定类型
apply-versions bump patch       # 升级补丁版本 (1.0.0 -> 1.0.1)
apply-versions bump minor       # 升级次版本 (1.0.0 -> 1.1.0)
apply-versions bump major       # 升级主版本 (1.0.0 -> 2.0.0)
apply-versions bump prerelease  # 创建预发布版本 (1.0.0 -> 1.0.1-alpha.0)
```

## 交互式模式

当不指定版本类型时，工具会显示交互式菜单：

```bash
cd packages/service-a
apply-versions bump
```

**输出:**
```
? Select the version bump type: › - Use arrow-keys. Return to submit.
❯   Patch (x.x.X) - Bug fixes
    Minor (x.X.0) - New features
    Major (X.0.0) - Breaking changes
    Prerelease (x.x.X-id.0) - Pre-release version
```

使用箭头键选择，然后按回车确认。

如果选择 Prerelease，会提示输入预发布标识符：

```
? Enter prerelease identifier (e.g., alpha, beta, rc): › alpha
```

## 选项

- `--yes, -y`: 跳过确认提示，自动执行
- `--verbose, -v`: 显示详细输出
- `--config, -c`: 指定 versions.toml 配置文件路径

## 使用场景

### 场景 1: 交互式升级版本

```bash
cd packages/service-a
apply-versions bump
```

**输出:**
```
? Select the version bump type: › Patch (x.x.X) - Bug fixes
✔ Select the version bump type: › Patch (x.x.X) - Bug fixes

📦 Packages to bump:

  service-a
    📁 Path: packages/service-a
    🔖 1.0.0 → 1.0.1 (patch)

Do you want to proceed? (y/n)
```

### 场景 2: 在单个包目录中升级版本

```bash
cd packages/service-a
apply-versions bump patch
```

**输出:**
```
📦 Packages to bump:

  service-a
    📁 Path: packages/service-a
    🔖 1.0.0 → 1.0.1 (patch)

Do you want to proceed? (y/n)
```

### 场景 3: 创建预发布版本

```bash
cd packages/service-a
apply-versions bump prerelease --yes
```

**输出:**
```
📦 Packages to bump:

  service-a
    📁 Path: packages/service-a
    🔖 1.0.0 → 1.0.1-alpha.0 (prerelease)

📝 Updating versions.toml...
✅ Updated versions.toml

🚀 Applying version changes...
[应用版本更改的输出...]
```

也可以交互式选择自定义预发布标识符：

```bash
cd packages/service-a
apply-versions bump
# 选择 Prerelease
# 输入 "beta" 作为标识符
# 结果: 1.0.0 → 1.0.1-beta.0
```

### 场景 4: 在包含多个包的目录中升级

```bash
cd packages
apply-versions bump minor --yes
```

**输出:**
```
📦 Packages to bump:

  service-a
    📁 Path: packages/service-a
    🔖 1.0.0 → 1.1.0 (minor)

  service-b
    📁 Path: packages/service-b
    🔖 2.0.0 → 2.1.0 (minor)

📝 Updating versions.toml...
✅ Updated versions.toml

🚀 Applying version changes...
[应用版本更改的输出...]
```

### 场景 5: 在深层嵌套目录中升级

```bash
cd packages/service-a/src/components
apply-versions bump patch --yes
```

工具会自动向上查找 `versions.toml`，识别当前所在的包，并升级该包的版本。

## 工作流程

1. **查找配置**: 向上搜索 `versions.toml` 文件
2. **识别包**: 根据当前目录确定要升级的包
3. **选择类型**: 如果未指定，显示交互式菜单选择 bump 类型
4. **输入标识符**: 如果选择 prerelease，提示输入预发布标识符
5. **计算新版本**: 根据 bump 类型计算新版本
6. **显示预览**: 显示将要执行的更改
7. **确认**: 询问用户确认（除非使用 `--yes`）
8. **更新 TOML**: 更新 `versions.toml` 文件中的版本号
9. **应用更改**: 自动运行 apply 流程，更新实际的包文件并创建 git commit

## 版本升级规则

遵循语义化版本规范 (Semantic Versioning):

- **patch**: 修复 bug，向后兼容 (1.0.0 -> 1.0.1)
- **minor**: 新增功能，向后兼容 (1.0.0 -> 1.1.0)
- **major**: 破坏性更改，不向后兼容 (1.0.0 -> 2.0.0)
- **prerelease**: 预发布版本，用于测试 (1.0.0 -> 1.0.1-alpha.0)

### 预发布版本

预发布版本格式为 `major.minor.patch-identifier.0`，例如：

- `1.0.1-alpha.0` - Alpha 测试版本
- `1.0.1-beta.0` - Beta 测试版本
- `1.0.1-rc.0` - Release Candidate 候选版本

标识符可以是任何字母数字组合，常用的有：
- `alpha`: 内部测试版本
- `beta`: 公开测试版本
- `rc`: 发布候选版本
- `dev`: 开发版本

## 注意事项

- 必须在包含 `versions.toml` 的项目目录树中执行
- 必须在包目录或其子目录中执行（不能在根目录执行）
- 会自动创建 git commit
- 支持同时升级多个包（当在父目录执行时）
- 保留 `versions.toml` 中的注释和其他配置
- 预发布标识符必须只包含字母、数字和连字符
