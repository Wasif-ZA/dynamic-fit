# Frontend Test Run Record

**Tester:** Amer
**Date:** 9 September 2026
**Branch / Commit:** frontend-test-plan / e305653
**Browser:** Safari
**Device / Viewport:** MacBook / Desktop
**Frontend URL:** `http://localhost:5174`
**Backend URL:** `http://127.0.0.1:8000`
**FitVisualiser running:** No

## Results

| Test ID | Result | Notes / Issue |
| ------- | ------ | ------------- |
| FE-01   | PASS   | Login successful and redirected to Orders page |
| FE-02.  | PASS   | Empty login prevented; validation message displayed |
| FE-03   | PASS   | Direct access to `/orders` while logged out redirects to the Login page |
| FE-04   | PASS.  | Registration succeeded, redirected to Orders page, and new email appeared in the header |
| FE-05.  | PASS   | Missing required fields correctly prevent registration. Validation message is too general and should explicitly identify which required field(s) are missing. |
| FE-06   | PASS   | Orders page loaded successfully and displayed an empty state with 0 orders |
| FE-07   | PASS   | Existing order ORD-001 appears in the Orders list with Draft status and opens correctly |
| FE-08  | BLOCKED | Direct URL navigation reloads the app and clears mocked login state, so invalid-order handling could not be tested while authenticated |
| FE-09   | PASS   | Valid order created successfully as ORD-001 and redirected to Order details |
| FE-10   | PASS   | Order creation blocked when reference was missing; clear message displayed: "Add a reference so the depot can identify this order." |
| FE-11 | PASS | Order creation was blocked when no items were present; server returned "The server rejected this order. Check the item details." More specific frontend validation would improve usability. |
| FE-12   | PASS   | Valid item added successfully with correct item details |
| FE-13 | PASS | Missing required item data is correctly blocked. Current message "Item code, reference, dimensions and weight are required." is too general and should identify the specific missing field(s). |
| FE-14 | FAIL | Frontend allows invalid item data to be added: 0×0×0 mm dimensions were accepted with both 0 kg and 1 kg weight. Invalid dimensions are only rejected later by the server when creating the order. Item code `itm22` is also accepted; verify whether `ITM-###` format is mandatory. |
| FE-15 | PASS | Item was removed successfully and the order summary updated correctly after removal. |
| FE-16   | PASS   | Quantity and total weight calculated correctly: 2 units × 5 kg = 10 kg |
| FE-18 | PASS | Item was added successfully with Box Group left blank; the item displayed `--` for Box Group. |
| FE-19 | PASS | Packing completed successfully for ORD-002; status changed to Packed and packing results displayed 2 boxes, 14 items packed, and 0 rejected. |
| FE-20 | FAIL | Clicking "Pack again" on an already packed order produced no visible action, feedback, or updated result. |
| FE-21   |        |               |
| FE-22   |        |               |
| FE-23   |        |               |
| FE-24   |        |               |
| FE-25 | PASS | When FitVisualiser was unavailable on localhost:5173, the visualisation link could not open. Core packing results remained available in FitPortal. |
| FE-26   |        |               |
| FE-27   |        |               |
| FE-28   |        |               |
| FE-29   |        |               |
| FE-30   |        |               |
| FE-31   |        |               |
| FE-32   |        |               |
| FE-33   |        |               |

## Failures Requiring GitHub Issues

| Test ID | Issue Number | Summary |
| ------- | ------------ | ------- |
|         |              |         |

## Overall Result

* High-priority tests passed:
* High-priority tests failed:
* Medium-priority tests passed:
* Medium-priority tests failed:
* Blocked tests:

**Overall Status:** PASS / FAIL / PARTIAL
