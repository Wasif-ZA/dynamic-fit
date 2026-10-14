# FitPortal Frontend Testing

This folder contains the frontend testing documentation for FitPortal.

The purpose of these tests is to verify the main user-facing workflows and identify frontend issues before changes are merged into the main branch.

## Test Files

```text
frontend/tests/
├── README.md
├── manual-test-cases.md
└── test-run-template.md
```

### `README.md`

Explains the frontend testing process and how test results should be recorded.

### `manual-test-cases.md`

Contains the detailed manual frontend test cases, including:

- authentication
- orders
- item entry
- validation
- packing
- FitVisualiser integration
- API failure handling
- responsive layout
- navigation
- production build

### `test-run-template.md`

Used to record the result of a manual frontend test run.

---

## Current Test Approach

The first frontend testing stage is manual functional testing.

Run the cases in:

```text
frontend/tests/manual-test-cases.md
```

Record the results of each test run using:

```text
frontend/tests/test-run-template.md
```

Record each test as:

- PASS
- FAIL
- BLOCKED
- NOT RUN

For failed tests, record:

- actual behaviour
- browser/device
- screenshot if useful
- console error if present
- related GitHub issue

---

## Before Testing

The Portal API and FitPortal frontend should be running.

### Start the backend

From the backend directory:

```bash
uvicorn app.main:app --reload
```

The backend should be available at:

```text
http://127.0.0.1:8000
```

The API documentation can be checked at:

```text
http://127.0.0.1:8000/docs
```

### Start the frontend

From the frontend directory:

```bash
npm install
npm run dev
```

The frontend should be available at:

```text
http://localhost:5174
```

---

## FitVisualiser

FitVisualiser is a separate application expected at:

```text
http://localhost:5173
```

The FitPortal frontend can still be tested without FitVisualiser running.

Order creation, packing and packing summaries should remain usable. Only the external 3D visualisation will be unavailable.

Tests that specifically require FitVisualiser should be marked appropriately if the service is not available.

---

## Manual Testing Process

For each test case:

1. Read the test purpose and expected result.
2. Follow the test steps.
3. Compare the actual behaviour with the expected behaviour.
4. Record the result as PASS, FAIL, BLOCKED or NOT RUN.
5. Record unexpected behaviour in the notes.
6. Capture screenshots or browser console errors where useful.
7. Create a GitHub issue for confirmed defects when appropriate.

A test can still PASS when the required functionality works but a minor usability improvement is identified. The improvement should be recorded in the notes.

---

## Current Limitations

Authentication is currently mocked.

Because the authentication state may not persist after a full browser reload, tests involving direct URL navigation may behave differently from normal in-app navigation.

This should be recorded as a limitation rather than automatically treated as a frontend failure.

FitVisualiser is also maintained separately and may not always be running during FitPortal frontend testing.

---

## Future Testing

Manual testing is the first stage of frontend testing.

Future work can add automated frontend tests for areas such as:

- login validation
- registration validation
- item entry validation
- order creation
- API error handling
- routing
- packing workflows
- component behaviour

Automated tests should be added separately without replacing the manual test cases in this folder.