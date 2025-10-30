# Visual Guide: cURL Import Feature

## Button Location

The new "Import/Execute cURL" button appears in the Flow Test Explorer view toolbar:

```
┌─────────────────────────────────────────────────┐
│ FLOW TESTS ENGINE                               │
├─────────────────────────────────────────────────┤
│  [Run All] [Refresh] [Retest] [Graph] [Results] │
│  [Filter] [Clear Filter]                        │
│  ... (secondary menu)                           │
│  ├─ [Create Config]                             │
│  ├─ [Select Config]                             │
│  ├─ [Import Swagger]                            │
│  ├─ [Import Postman]                            │
│  └─ [Import/Execute cURL]  ← NEW!               │
└─────────────────────────────────────────────────┘
```

## Workflow Diagram

```
┌──────────────────────────────────────────────────────────┐
│ 1. User clicks "Import/Execute cURL" button              │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 2. Input Dialog appears                                  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Import/Execute cURL Command                         │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │ Paste your cURL command here                        │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │ curl -X GET https://api.example.com/endpoint        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ✓ Validates: Must start with 'curl'                     │
│  ✓ Validates: Cannot be empty                            │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Choose Action                                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ○ Execute and Convert                               │ │
│  │   Run the cURL command and convert response         │ │
│  │                                                       │ │
│  │ ○ Convert Only                                       │ │
│  │   Convert cURL to Flow Test without executing       │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ 4. Save Option                                           │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ ○ Yes - Save to a test file                        │ │
│  │                                                       │ │
│  │ ○ No - Just show the result                         │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────┬─────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
    If YES │                     │ If NO
          ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐
│ 5a. Save Dialog     │  │ 5b. Show in Output  │
│                     │  │                     │
│ ┌─────────────────┐ │  │ ┌─────────────────┐ │
│ │ Save Flow Test  │ │  │ │ OUTPUT PANEL    │ │
│ ├─────────────────┤ │  │ ├─────────────────┤ │
│ │ tests/imported/ │ │  │ │ Flow Test       │ │
│ │ curl-test.yaml  │ │  │ │ Import/Export   │ │
│ └─────────────────┘ │  │ │                 │ │
│                     │  │ │ ✅ cURL import  │ │
│                     │  │ │  completed      │ │
│                     │  │ │  successfully   │ │
└─────────┬───────────┘  │ └─────────────────┘ │
          │              └─────────────────────┘
          ▼
┌─────────────────────┐
│ 6. Success Message  │
│                     │
│ ○ Open File         │
│ ○ View Output       │
└─────────────────────┘
```

## Example Screenshots

### Button in Toolbar
```
Flow Test Explorer Toolbar:
[▶ Run All] [🔄 Refresh] [⟲ Retest] [📊 Graph] [👁 Results] [🔍 Filter]
    ⋮ More actions
    ├─ 📝 Create Config
    ├─ 📂 Select Config  
    ├─ ☁️ Import Swagger
    ├─ ☁️ Import Postman
    └─ 💻 Import/Execute cURL  ← New Button!
```

### Input Validation Example

#### Valid Input ✅
```
curl -X POST https://api.example.com/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret"}'
```

#### Invalid Input ❌
```
wget https://example.com
Error: Command must start with 'curl'
```

### Output Panel Example
```
================ Flow Test cURL Import ================
Command: flow-test-engine --curl-import "curl -X GET https://api.example.com/users" --curl-execute
Working directory: /workspace/project
cURL command: curl -X GET https://api.example.com/users
Mode: Execute and convert
========================================================

Executing cURL command...
Response received: 200 OK
Converting to Flow Test format...
Test file created: /workspace/project/tests/imported/curl-test.yaml

✅ cURL import completed successfully
```

## Integration Points

### Flow Test Engine CLI
The extension calls the Flow Test Engine with these flags:
```bash
flow-test-engine \
  --curl-import "curl -X GET https://api.example.com" \
  --curl-output "/path/to/test.yaml" \
  --curl-execute
```

### VS Code UI Components Used
- ✅ `vscode.window.showInputBox` - For cURL input
- ✅ `vscode.window.showQuickPick` - For action selection
- ✅ `vscode.window.showSaveDialog` - For file save
- ✅ `vscode.window.showInformationMessage` - For success/error
- ✅ `vscode.window.withProgress` - For progress indication
- ✅ Output Channel - For detailed logs

## Feature Benefits

1. 🚀 **Quick Testing** - Test APIs instantly without leaving VS Code
2. 📚 **Documentation Import** - Convert cURL examples from docs
3. 🧪 **Test Creation** - Turn ad-hoc requests into repeatable tests
4. 🔍 **Debugging** - Execute and inspect API responses
5. 🤝 **Team Sharing** - Share API endpoints as cURL commands
