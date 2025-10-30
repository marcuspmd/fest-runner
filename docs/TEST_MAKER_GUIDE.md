# 🧪 Flow Test Maker - User Guide

## Overview

The Flow Test Maker is a powerful visual interface for creating comprehensive test configurations within VS Code. It allows you to design complex test scenarios with multiple steps, assertions, captures, and advanced features without writing YAML or JSON manually.

## Getting Started

### Opening the Test Maker

There are several ways to open the Test Maker:

1. **Command Palette**:
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Open Test Maker"
   - Select "Flow Test Runner: Open Test Maker"

2. **Activity Bar** (if available):
   - Click on the Flow Tests icon
   - Look for the "Open Test Maker" button

## Interface Sections

### 1. Test Configuration

The top section contains global test settings:

- **Test Name** (required): A descriptive name for your test
- **Test Type**: Choose from API, Unit, Integration, or E2E test types
- **Base URL**: Optional base URL that will be prepended to all step URLs
- **Description**: Optional description of what the test does
- **Global Headers**: Headers that will be included in all requests

### 2. Test Steps

Each test consists of one or more steps. Steps are executed sequentially unless dependencies are configured.

#### Basic Step Configuration

- **Step Name** (required): Descriptive name for the step
- **HTTP Method**: GET, POST, PUT, DELETE, PATCH
- **URL Path** (required): Endpoint path (relative to base URL or absolute)

#### Advanced Step Features

##### Headers Tab
Add custom headers specific to this step:
- Click "+ Add Header" to add a new header
- Enter header name and value
- Click "×" to remove a header

##### Body Tab
For POST, PUT, and PATCH requests:
- Enter JSON body in the textarea
- The editor will attempt to parse and validate JSON

##### Asserts Tab
Add assertions to validate the response:
- **Type**: Choose assertion type (equals, contains, statusCode, etc.)
- **Path**: JSONPath to the value to validate (e.g., `$.data.id`)
- **Expected Value**: The expected value or pattern

Common assertion types:
- `equals`: Value must equal expected value
- `notEquals`: Value must not equal expected value
- `contains`: Value must contain expected substring
- `exists`: Path must exist in response
- `statusCode`: HTTP status code validation
- `responseTime`: Response time validation (in ms)

##### Captures Tab
Extract values from responses to use in subsequent steps:
- **Variable Name**: Name to store the captured value
- **Path**: JSONPath to the value to capture (e.g., `$.data.token`)

Captured variables can be referenced in later steps using `${variableName}`.

##### Advanced Tab
Additional step configuration:
- **Timeout**: Maximum time (ms) to wait for response
- **Retries**: Number of times to retry on failure

### 3. Actions

- **⚡ Generate Test**: Creates the YAML/JSON test configuration
- **💾 Save Draft**: Saves current configuration for later (coming soon)
- **📂 Load Draft**: Loads a previously saved draft (coming soon)

### 4. Generated Test

After clicking "Generate Test", the output section displays:
- The generated YAML configuration
- **📋 Copy**: Copy to clipboard
- **💾 Save to File**: Save directly to a file in your workspace

## Usage Examples

### Example 1: Simple API Test

```yaml
# Configuration
Test Name: User API Test
Test Type: API
Base URL: https://api.example.com

# Step 1
Name: Get User
Method: GET
URL Path: /users/123

Asserts:
- statusCode: 200
- exists: $.data.id
- equals: $.data.name -> "John Doe"
```

### Example 2: Multi-Step Test with Captures

```yaml
# Configuration
Test Name: Login and Fetch Profile
Base URL: https://api.example.com

# Step 1: Login
Name: Login
Method: POST
URL Path: /auth/login
Body: {
  "username": "user@example.com",
  "password": "secret"
}
Captures:
- token: $.data.token

# Step 2: Get Profile
Name: Get Profile
Method: GET
URL Path: /profile
Headers:
- Authorization: Bearer ${token}
```

### Example 3: Complex Test with Dependencies

```yaml
# Configuration
Test Name: E-Commerce Checkout Flow
Base URL: https://api.shop.com

# Step 1: Create Cart
Method: POST
URL Path: /cart
Captures:
- cartId: $.data.cartId

# Step 2: Add Items
Method: POST
URL Path: /cart/${cartId}/items
Body: {
  "productId": "PROD-123",
  "quantity": 2
}

# Step 3: Checkout
Method: POST
URL Path: /cart/${cartId}/checkout
Asserts:
- statusCode: 200
- exists: $.data.orderId
```

## Best Practices

### Naming Conventions

- Use descriptive step names that explain what the step does
- Use kebab-case for test file names: `user-authentication-test.yml`
- Use camelCase for variable names in captures

### Assertions

- Always add a status code assertion for API tests
- Validate critical response fields with specific assertions
- Use `exists` for optional fields and `equals` for required fields

### Variables and Captures

- Capture authentication tokens in login steps
- Capture resource IDs for use in subsequent operations
- Use descriptive variable names: `authToken`, `userId`, `orderId`

### Step Organization

- Keep steps focused on a single operation
- Group related operations logically
- Use descriptive names for complex operations

## Keyboard Shortcuts

(Coming soon)

## Tips and Tricks

### JSONPath Examples

- `$.data` - Access the data field
- `$.data.users[0]` - First item in users array
- `$.data.users[*].name` - All user names
- `$..email` - All email fields at any depth

### Variable Substitution

Variables captured in previous steps can be used in:
- URL paths: `/users/${userId}`
- Headers: `Authorization: Bearer ${token}`
- Body fields: `{"parentId": "${resourceId}"}`
- Query parameters: `?token=${authToken}`

### Common Patterns

**Authentication Pattern**:
1. Login step captures token
2. Subsequent steps use token in Authorization header

**CRUD Pattern**:
1. Create: POST request, capture resource ID
2. Read: GET request using captured ID
3. Update: PUT request using captured ID
4. Delete: DELETE request using captured ID

**Pagination Pattern**:
1. First request captures next page token
2. Loop using token until no more pages

## Troubleshooting

### Test Generation Fails

- Ensure all required fields are filled (Test Name, Step Names, URLs)
- Validate JSON body format
- Check JSONPath syntax in assertions and captures

### Variables Not Working

- Ensure the capture step runs before the step using the variable
- Check variable name spelling matches exactly
- Verify the JSONPath in the capture is correct

### Status Code Failures

- Check that the expected status code matches the API response
- Ensure proper authentication headers are included
- Verify the request body format matches API expectations

## Advanced Features

### Loop Configuration (Coming Soon)

Execute a step multiple times:
- **iterations**: Fixed number of iterations
- **while**: Condition-based loop
- **forEach**: Iterate over array

### Call Configuration (Coming Soon)

Invoke external functions or nested tests:
- **function**: Call a JavaScript function
- **api**: Call another API endpoint
- **step**: Execute another test step

### Scenarios (Coming Soon)

Define alternative execution paths:
- Create multiple scenarios
- Each scenario has its own steps
- Scenarios run based on conditions

### Dependencies (Coming Soon)

Control step execution order:
- Define which steps must complete first
- Add conditional dependencies
- Create parallel execution groups

## Support

For issues, feature requests, or questions:
- GitHub: [marcuspmd/fest-runner](https://github.com/marcuspmd/fest-runner)
- Documentation: Check the main README.md

## Version History

### v0.2.0 (Current)
- ✨ Initial Test Maker interface
- ✅ Visual step builder
- ✅ Assertions and captures support
- ✅ YAML/JSON generation
- ✅ Save to file functionality

### Coming Soon
- 🔄 Draft save/load
- 🔁 Loop and call configurations
- 🎭 Scenarios support
- 📊 Test visualization
- 🎨 Syntax highlighting in output
- ⌨️ Keyboard shortcuts
- 🌐 Variable auto-complete
