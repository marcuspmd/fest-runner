# cURL Import Feature

## Overview
This feature adds a quick action button to the Flow Test Runner extension that allows users to import and execute cURL commands directly from the VS Code interface.

## User Interface Changes

### 1. New Button in View Title
A new button with a terminal icon ($(terminal)) has been added to the view/title menu in the Flow Test Explorer panel.

**Location**: View title toolbar (secondary actions menu)
**Icon**: Terminal icon
**Label**: "Import/Execute cURL"

### 2. User Workflow

#### Step 1: Click the "Import/Execute cURL" button
The button appears in the Flow Test Explorer panel's toolbar, in the secondary actions section alongside other import/export options.

#### Step 2: Input cURL Command
A text input box appears asking the user to paste their cURL command:
```
Title: Import/Execute cURL Command
Prompt: Paste your cURL command here
Placeholder: curl -X GET https://api.example.com/endpoint
```

Validation:
- Command cannot be empty
- Command must start with 'curl'

#### Step 3: Choose Action
A quick pick menu with two options:
- **Execute and Convert**: Runs the cURL command and converts the response to a Flow Test
- **Convert Only**: Converts the cURL command to Flow Test format without executing

#### Step 4: Save Option
A quick pick menu asking if the user wants to save the test:
- **Yes - Save to a test file**: Opens a file save dialog
- **No - Just show the result**: Displays results in the output panel only

#### Step 5: Results
If saved:
- File is saved to the chosen location
- User can choose to:
  - Open the file immediately
  - View output panel
  - Cancel

If not saved:
- Results are shown in the "Flow Test Import/Export" output channel

## Technical Details

### New Command
- **Command ID**: `flow-test-runner.importCurl`
- **Title**: "Import/Execute cURL"
- **Icon**: `$(terminal)`
- **When**: Available when `workspaceHasFlowTests` is true

### Service Method
Added to `ImportExportService`:
```typescript
async importCurl(options: CurlImportOptions): Promise<CurlExecutionResult>
```

### CLI Integration
The feature calls the Flow Test Engine CLI with:
```bash
flow-test-engine --curl-import "<curl command>" [--curl-output <path>] [--curl-execute]
```

### Output
- All output is shown in the "Flow Test Import/Export" output channel
- Successful imports show a success message
- Errors are displayed via VS Code's error message UI

## Example Usage

### Example 1: Simple GET Request
```bash
curl -X GET https://api.example.com/users
```

### Example 2: POST Request with Headers and Body
```bash
curl -X POST https://api.example.com/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

### Example 3: Complex Request with Authentication
```bash
curl -X GET https://api.example.com/protected \
  -H "Authorization: Bearer token123" \
  -H "Accept: application/json"
```

## Benefits

1. **Quick Testing**: Developers can quickly test API endpoints without leaving VS Code
2. **Documentation**: cURL commands from documentation can be easily imported
3. **Test Creation**: Convert ad-hoc cURL commands into repeatable tests
4. **Debugging**: Execute cURL commands and see responses immediately
5. **Team Sharing**: Share API endpoints as cURL commands that can be imported

## Future Enhancements

Possible future improvements:
- Support for environment variable substitution
- History of previously executed cURL commands
- Batch import of multiple cURL commands
- Integration with API documentation tools
