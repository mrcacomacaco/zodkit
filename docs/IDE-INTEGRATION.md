# IDE Integration Guide

zodkit provides comprehensive IDE support to enhance your development experience with Zod schema validation.

## VS Code Integration

### Quick Setup

1. **Install zodkit globally**:
   ```bash
   npm install -g zodkit
   ```

2. **Open your project in VS Code**

3. **The workspace will automatically detect zodkit** and provide:
   - Schema validation on save
   - IntelliSense for configuration files
   - Code snippets for common Zod patterns
   - Integrated terminal commands

### Features

#### 1. Configuration IntelliSense

VS Code automatically provides autocomplete and validation for `zod.config.js` files:

- Property suggestions
- Type checking
- Documentation on hover
- Error highlighting

#### 2. Code Snippets

Type these prefixes to quickly generate Zod schemas:

| Prefix | Description | Generated Code |
|--------|-------------|----------------|
| `zodschema` | Basic Zod schema | Complete schema with TypeScript type |
| `zodfrontmatter` | MDX frontmatter schema | Blog/docs frontmatter validation |
| `zodapi` | API request/response | REST API schemas |
| `zodenum` | Enum schema | Type-safe enums |
| `zodvalidate` | Validation function | Error handling wrapper |
| `zodsafeparse` | Safe parse pattern | Try/catch alternative |

#### 3. Workspace Settings

zodkit includes optimized VS Code settings:

```json
{
  "zodkit.enable": true,
  "zodkit.autoValidate": true,
  "zodkit.validateOnSave": true
}
```

#### 4. Recommended Extensions

The workspace recommends these extensions for the best experience:

- **ESLint**: Linting integration
- **Prettier**: Code formatting
- **TypeScript**: Enhanced TS support
- **GitLens**: Git integration
- **Code Spell Checker**: Typo detection

### Custom Configuration

#### Schema Validation on Save

Enable automatic validation when files are saved:

```json
// .vscode/settings.json
{
  "zodkit.validateOnSave": true,
  "zodkit.showErrorsInline": true
}
```

#### Custom Key Bindings

Add keyboard shortcuts for common zodkit commands:

```json
// .vscode/keybindings.json
[
  {
    "key": "cmd+shift+z",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "npx zodkit check\n" }
  },
  {
    "key": "cmd+shift+f",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "npx zodkit fix\n" }
  }
]
```

## JetBrains IDEs (WebStorm, IntelliJ)

### Setup

1. **Install zodkit**:
   ```bash
   npm install --save-dev zodkit
   ```

2. **Configure File Watchers**:
   - Go to Settings → Tools → File Watchers
   - Add new watcher:
     - Name: `zodkit`
     - File type: TypeScript
     - Program: `$ProjectFileDir$/node_modules/.bin/zodkit`
     - Arguments: `check $FilePath$`

3. **Add External Tool**:
   - Settings → Tools → External Tools
   - Add new tool:
     - Name: `zodkit Check`
     - Program: `npm`
     - Arguments: `run zodkit check`

### Configuration Schema

JetBrains IDEs automatically detect the JSON schema:

1. The `zodkit.schema.json` file provides autocomplete
2. Configuration files get validated in real-time
3. Quick fixes are suggested for common issues

## Vim/Neovim Integration

### Using CoC (Conquer of Completion)

Add to your `coc-settings.json`:

```json
{
  "eslint.autoFixOnSave": true,
  "coc.preferences.formatOnSaveFiletypes": ["typescript", "javascript"],
  "languageserver": {
    "zodkit": {
      "command": "zodkit",
      "args": ["lsp"],
      "filetypes": ["typescript", "javascript", "mdx"]
    }
  }
}
```

### Using ALE (Asynchronous Lint Engine)

Add to your `.vimrc` or `init.vim`:

```vim
" Add zodkit as a linter
let g:ale_linters = {
\   'typescript': ['zodkit', 'eslint'],
\   'javascript': ['zodkit', 'eslint'],
\   'mdx': ['zodkit'],
\}

" Add zodkit as a fixer
let g:ale_fixers = {
\   'typescript': ['zodkit', 'prettier'],
\   'javascript': ['zodkit', 'prettier'],
\}

" Run zodkit on save
let g:ale_fix_on_save = 1
```

## Sublime Text Integration

### Package Control Installation

1. Install `SublimeLinter-contrib-zodkit` via Package Control
2. Configure in your project settings:

```json
{
  "SublimeLinter.linters.zodkit": {
    "executable": "zodkit",
    "args": ["check", "--format", "json"],
    "env": {},
    "excludes": [],
    "working_dir": "$project_path"
  }
}
```

## Emacs Integration

### Using Flycheck

Add to your Emacs configuration:

```elisp
(flycheck-define-checker typescript-zodkit
  "A TypeScript checker using zodkit."
  :command ("zodkit" "check" "--format" "json" source)
  :error-parser flycheck-parse-json
  :modes (typescript-mode tsx-mode))

(add-to-list 'flycheck-checkers 'typescript-zodkit)
```

### Using LSP Mode

```elisp
(use-package lsp-mode
  :config
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection "zodkit lsp")
    :major-modes '(typescript-mode tsx-mode)
    :server-id 'zodkit)))
```

## Terminal Integration

### Zsh/Bash Aliases

Add to your `.zshrc` or `.bashrc`:

```bash
# zodkit aliases
alias zc='zodkit check'
alias zf='zodkit fix'
alias zi='zodkit init'
alias za='zodkit analyze'
alias zw='zodkit check --watch'

# Function for quick validation
zvalidate() {
  zodkit check "$@" && echo "✅ All schemas valid!" || echo "❌ Validation failed"
}
```

### Fish Shell

Add to your `config.fish`:

```fish
# zodkit abbreviations
abbr -a zc zodkit check
abbr -a zf zodkit fix
abbr -a zi zodkit init
abbr -a za zodkit analyze

# Function for validation
function zvalidate
  zodkit check $argv
  and echo "✅ All schemas valid!"
  or echo "❌ Validation failed"
end
```

## CI/CD Integration

### Pre-commit Hooks

Add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: zodkit
        name: zodkit validation
        entry: zodkit check --ci
        language: system
        files: \.(ts|tsx|js|jsx|mdx)$
```

### Git Hooks (using Husky)

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "zodkit check --ci"
    }
  }
}
```

## Language Server Protocol (Future)

A dedicated Language Server for zodkit is planned, which will provide:

- Real-time validation as you type
- Go-to-definition for schemas
- Find all references
- Rename refactoring
- Quick fixes and code actions
- Hover documentation

## Custom Editor Integration

For editors not listed above, you can integrate zodkit using:

1. **Command Line Integration**:
   ```bash
   zodkit check --format json | your-editor-parser
   ```

2. **File Watcher**:
   - Watch for changes in `.ts`, `.tsx`, `.mdx` files
   - Run `zodkit check <file>` on change
   - Parse output and display in editor

3. **Build Task Integration**:
   - Add zodkit as a build task
   - Parse JSON or SARIF output
   - Display inline errors

## Troubleshooting

### Common Issues

1. **zodkit command not found**:
   - Ensure zodkit is installed globally: `npm install -g zodkit`
   - Or use npx: `npx zodkit`

2. **VS Code not detecting config schema**:
   - Restart VS Code
   - Check that `zodkit.schema.json` exists in project root

3. **Validation not running on save**:
   - Check workspace settings for `zodkit.validateOnSave`
   - Ensure file type is included in validation patterns

4. **Performance issues with large projects**:
   - Adjust `performance.maxConcurrency` in config
   - Use more specific file patterns
   - Enable caching: `performance.cache: true`

## Contributing

Want to add support for your favorite editor? See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on creating editor integrations.