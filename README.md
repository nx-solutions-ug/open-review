# Open Review - AI-Powered Code Review for GitHub

[![GitHub Marketplace](https://img.shields.io/badge/Markplace-Open%20Review-blue)](https://github.com/marketplace/actions/open-review)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An intelligent GitHub Action that automatically reviews pull requests using Large Language Models (LLMs). Posts inline comments like GitHub Copilot, helping you catch issues before they reach production.

## Features

- 🤖 **AI-Powered Reviews** - Uses any OpenAI-compatible LLM API
- 💬 **Inline Comments** - Posts review comments directly on changed lines
- 🔒 **Security Focus** - Detects vulnerabilities, secrets, and security issues
- ⚡ **Performance** - Identifies bottlenecks and optimization opportunities
- 🎯 **Multiple Review Modes** - Summary, detailed, security, or performance reviews
- 🌐 **Universal LLM Support** - Works with OpenAI, Anthropic, Azure, Ollama, and more
- 📊 **Smart Chunking** - Handles large PRs by intelligently chunking files
- 🔄 **Retry Logic** - Automatically retries failed API calls
- 🛡️ **Secure** - Masks API keys and follows security best practices

## Quick Start

### 1. Add the workflow to your repository

Create `.github/workflows/ai-code-review.yml`:

```yaml
name: Open Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: AI Code Review
        uses: nx-solutions-ug/ai-code-review-action@v1
        with:
          LLM_BASE_URL: 'https://api.openai.com/v1'
          LLM_MODEL: 'gpt-4o'
          LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Add your LLM API key

Go to **Settings > Secrets and variables > Actions** and add:
- `OPENAI_API_KEY` - Your OpenAI API key

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `LLM_BASE_URL` | ✅ | - | Base URL for the LLM API (e.g., `https://api.openai.com/v1`) |
| `LLM_MODEL` | ✅ | - | Model to use (e.g., `gpt-4o`, `claude-3-sonnet`) |
| `LLM_API_KEY` | ✅ | - | API key for the LLM service |
| `GITHUB_TOKEN` | ✅ | `${{ github.token }}` | GitHub token for API access |
| `PROMPT` | ❌ | (mode-specific) | Custom prompt template for the LLM |
| `REVIEW_MODE` | ❌ | `detailed` | Review mode: `summary`, `detailed`, `security`, `performance` |
| `MAX_FILES` | ❌ | `50` | Maximum files to review (0 for unlimited) |
| `EXCLUDE_PATTERNS` | ❌ | `*.lock,*.min.js,...` | Comma-separated patterns to exclude |
| `FAIL_ON_ERROR` | ❌ | `false` | Fail workflow if review fails |
| `POST_AS_REVIEW` | ❌ | `true` | Post as formal PR review (true) or comments (false) |

## Outputs

| Output | Description |
|--------|-------------|
| `review-summary` | Summary of the code review findings |
| `files-reviewed` | Number of files reviewed |
| `comments-posted` | Number of review comments posted |
| `status` | Review status: `success`, `partial`, or `failed` |

## Usage Examples

### Basic Usage with OpenAI

```yaml
- name: Open Review - Code Review
  uses: nx-solutions-ug/ai-code-review-action@v1
  with:
    LLM_BASE_URL: 'https://api.openai.com/v1'
    LLM_MODEL: 'gpt-4o'
    LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Security-Focused Review

```yaml
- name: Open Review - Security Review
  uses: nx-solutions-ug/ai-code-review-action@v1
  with:
    LLM_BASE_URL: 'https://api.openai.com/v1'
    LLM_MODEL: 'gpt-4o'
    LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    REVIEW_MODE: 'security'
```

### Using Anthropic Claude

```yaml
- name: Open Review - Code Review with Claude
  uses: nx-solutions-ug/ai-code-review-action@v1
  with:
    LLM_BASE_URL: 'https://api.anthropic.com/v1'
    LLM_MODEL: 'claude-3-5-sonnet-20241022'
    LLM_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Using Local LLM (Ollama)

```yaml
- name: Open Review - Code Review with Local LLM
  uses: nx-solutions-ug/ai-code-review-action@v1
  with:
    LLM_BASE_URL: 'http://localhost:11434/v1'
    LLM_MODEL: 'codellama'
    LLM_API_KEY: 'ollama'  # Required but unused by Ollama
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Custom Prompt

```yaml
- name: Open Review - Code Review with Custom Prompt
  uses: nx-solutions-ug/ai-code-review-action@v1
  with:
    LLM_BASE_URL: 'https://api.openai.com/v1'
    LLM_MODEL: 'gpt-4o'
    LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PROMPT: |
      You are a senior engineer reviewing code. Focus on:
      1. Code readability and maintainability
      2. Test coverage
      3. Documentation
      
      Output format (JSON):
      {
        "reviews": [
          {
            "line": <line_number>,
            "severity": "critical|warning|suggestion",
            "category": "readability|testing|documentation",
            "message": "Your feedback"
          }
        ],
        "summary": "Brief summary"
      }
```

### Exclude Specific Files

```yaml
- name: Open Review - Code Review
  uses: nx-solutions-ug/ai-code-review-action@v1
  with:
    LLM_BASE_URL: 'https://api.openai.com/v1'
    LLM_MODEL: 'gpt-4o'
    LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    EXCLUDE_PATTERNS: '*.md,*.json,*.yaml,*.yml,generated/**,docs/**'
    MAX_FILES: '20'
```

## Review Modes

### Summary Mode
Provides a high-level overview of the changes without line-by-line comments.

### Detailed Mode (Default)
Comprehensive review covering:
- Security vulnerabilities
- Performance issues
- Maintainability concerns
- Best practices
- Code style

### Security Mode
Focuses exclusively on security issues:
- Injection vulnerabilities
- Authentication/authorization flaws
- Data exposure
- Cryptographic weaknesses
- Input validation

### Performance Mode
Identifies performance bottlenecks:
- Algorithm complexity
- Memory usage
- I/O operations
- Caching opportunities
- Resource cleanup

## Supported LLM Providers

This action works with any OpenAI-compatible API endpoint:

- **OpenAI** - GPT-4, GPT-4o, GPT-3.5-turbo
- **Anthropic** - Claude 3 (via OpenAI-compatible proxy)
- **Azure OpenAI** - GPT models on Azure
- **Ollama** - Local models (Llama, CodeLlama, etc.)
- **vLLM** - Self-hosted model serving
- **LocalAI** - OpenAI-compatible local inference
- **OpenRouter** - Unified API for multiple providers

## How It Works

1. **Trigger**: Action runs on pull request events
2. **Fetch**: Retrieves changed files from the PR
3. **Filter**: Excludes files matching patterns (lock files, generated code, etc.)
4. **Review**: Sends each file's diff to the LLM for analysis
5. **Parse**: Extracts structured review comments from LLM response
6. **Post**: Creates GitHub review comments on specific lines
7. **Summarize**: Posts overall review summary

## Error Handling

The action includes robust error handling:

- **Retry Logic**: Automatically retries failed API calls with exponential backoff
- **Partial Success**: Continues reviewing other files if one fails
- **Graceful Degradation**: Optionally continues workflow even if review fails
- **Token Limits**: Intelligently chunks large files to fit within context limits

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/nx-solutions-ug/open-review.git
cd open-review

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Project Structure

```
.
├── src/
│   ├── config.ts           # Configuration and input validation
│   ├── github/
│   │   └── client.ts       # GitHub API operations
│   ├── llm/
│   │   └── client.ts       # LLM API operations
│   ├── review/
│   │   └── orchestrator.ts # Review coordination logic
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   ├── utils/
│   │   ├── logger.ts       # Logging utilities
│   │   └── retry.ts        # Retry logic
│   └── index.ts            # Entry point
├── action.yml              # Action metadata
├── package.json
└── README.md
```

### Building

The action uses `@vercel/ncc` to bundle all dependencies into a single file:

```bash
npm run build
```

This creates `dist/index.js` which is committed to the repository and executed by GitHub Actions.

## Publishing to GitHub Marketplace

1. Ensure your repository is public
2. Create a release with semantic versioning (e.g., `v1.0.0`)
3. Check "Publish this Action to the GitHub Marketplace"
4. Select appropriate categories
5. Publish the release

## Security Considerations

- API keys are masked in logs using `core.setSecret()`
- HTTPS is enforced for LLM endpoints
- Minimal GitHub token permissions are requested
- No file contents or API responses are logged
- Input validation prevents injection attacks

## Troubleshooting

### "No pull request found"
Ensure your workflow triggers on `pull_request` events:
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
```

### "Rate limit exceeded"
The action includes retry logic, but you may need to:
- Use a different LLM provider
- Increase retry delays
- Reduce `MAX_FILES`

### Comments not appearing
Ensure your workflow has the correct permissions:
```yaml
permissions:
  contents: read
  pull-requests: write
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://github.com/nx-solutions-ug/open-review/wiki)
- 🐛 [Issue Tracker](https://github.com/nx-solutions-ug/open-review/issues)
- 💬 [Discussions](https://github.com/nx-solutions-ug/open-review/discussions)

---

Made with ❤️ by [NX Solutions UG](https://github.com/nx-solutions-ug)
