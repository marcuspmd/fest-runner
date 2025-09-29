# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Flow Test Runner** is a VS Code extension that executes and manages Flow Test Engine tests directly within the editor. It provides a tree view explorer for discovering and running YAML-based test suites with interactive input support, result visualization, and Mermaid graph generation.

## Development Commands

### Build and Compilation
- `npm run build` - Full build: typecheck + bundle (run before publishing)
- `npm run typecheck` - Type-check TypeScript without emitting files
- `npm run bundle` - Bundle extension with esbuild
- `npm run watch` - Watch mode for development (auto-rebuild on changes)
- `npm run vscode:prepublish` - Pre-publish hook (runs build)

### Testing
- `npm test` or `npm run test` - Run tests once with Vitest
- `npm run test:watch` - Run tests in watch mode

### Running the Extension
Press `F5` in VS Code to launch Extension Development Host with the extension loaded.

## Architecture

### Core Components

**Extension Entry Point** (`src/extension.ts`)
- Activates on workspace containing `.yml`/`.yaml` files
- Registers all commands and the tree data provider
- Sets up singleton services (ConfigService, HtmlResultsService, GraphService)
- Handles graph generation workflow with user prompts

**Test Provider** (`src/testProvider.ts`)
- TreeDataProvider implementation for the Flow Test Explorer view
- Manages tree structure: folders → suites → steps
- Maintains status tracking (pending/running/passed/failed) with icons
- Handles test filtering and execution coordination
- Listens to TestRunner events to update tree item states

**Test Scanner** (`src/testScanner.ts`)
- Discovers test files based on configurable patterns
- Sets up FileSystemWatchers for automatic test discovery
- Caches parsed YAML test suites with mtime validation
- Parses YAML files into FlowTestSuite objects

**Test Runner** (`src/testRunner.ts`)
- Spawns `flow-test-engine` CLI processes
- Handles interactive input requests via `@@FLOW_INPUT@@` protocol
- Manages input caching for repeated test runs
- Emits TestResult and SuiteResult events
- Supports cached input execution and last test re-execution

### Services

**ConfigService** (`src/services/configService.ts`)
- Singleton that loads and merges Flow Test configuration
- Priority: defaults < VS Code settings < config file (flow-test.config.yml)
- Caches configs per workspace
- Handles config file creation and selection prompts

**InputService** (`src/services/inputService.ts`)
- Manages interactive input cache (persistent via ExtensionContext.globalState)
- Prompts user for test inputs using VS Code UI (InputBox, QuickPick)
- Supports various input types: string, number, boolean, select, multi-select

**HtmlResultsService** (`src/services/htmlResultsService.ts`)
- Discovers and displays HTML test results in WebView panels
- Locates result files based on config reporting.outputDir

**GraphService** (`src/services/graphService.ts`)
- Generates Mermaid discovery graphs using `flow-test-engine graph` CLI
- Supports filtering by suites, nodes, tags
- Configurable direction (TD/LR/BT/RL) and orphan node handling

### Type System

**Core Types** (`src/models/types.ts`)
- `FlowTestSuite` - Parsed YAML test suite with steps
- `FlowTestStep` - Individual test step with request/call/assert/input
- `FlowTestConfig` - Complete configuration schema
- `TestExecutionState` - Tracks last test run for re-execution
- `UserInputRequest` - Input prompt metadata

### Interactive Input Protocol

The extension uses a custom protocol with `flow-test-engine`:
1. Passes `--runner-interactive-inputs` flag when config.interactiveInputs is true
2. Listens for `@@FLOW_INPUT@@` prefixed JSON events on stdout
3. Parses input request metadata (variable, prompt, type, options, masked)
4. Prompts user via VS Code UI or retrieves from cache
5. Sends response as JSON to stdin: `{"variable": "value"}`

## Configuration

Extension respects `flow-test-config.yml` or `test-config.yml` in workspace root:

```yaml
command: flow-test-engine
test_directories:
  - ./tests
interactive_inputs: true
discovery:
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
  exclude:
    - "**/node_modules/**"
    - "**/results/**"
graph:
  defaultDirection: TD
  defaultOutput: flow-discovery.mmd
  noOrphans: false
reporting:
  outputDir: results
  html:
    outputSubdir: html
    perSuite: true
    aggregate: true
```

## Testing

Tests use Vitest with a VS Code API mock (`tests/mocks/vscode.ts`). The test suite covers:
- TestProvider tree structure and filtering
- TestScanner file discovery and caching
- Graph generation command workflows

Run tests with `npm test` or `npm run test:watch` for TDD workflow.

## VS Code Extension Specifics

**Commands Context**
- Commands are conditionally enabled when `workspaceHasFlowTests` context is true
- Filter commands show/hide based on `flowTestRunner.filterActive` context

**Tree Item Context Values**
- `folder` - Directory grouping node
- `suite` - Test suite (runnable)
- `step-with-id` - Test step with step_id (individually runnable)
- `step-without-id` - Test step without step_id (not individually runnable)

**Status Indicators**
- Pending: circle-outline icon
- Running: loading~spin icon
- Passed: check icon (testing.iconPassed color)
- Failed: error icon (testing.iconFailed color)