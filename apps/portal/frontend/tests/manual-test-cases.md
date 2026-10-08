# FitPortal Manual Frontend Test Cases

These test cases verify the main FitPortal frontend workflows.

## Result Values

Use one of the following results:

- **PASS** — expected functionality worked
- **FAIL** — expected functionality did not work
- **BLOCKED** — test could not be completed because of another limitation or dependency
- **NOT RUN** — test has not yet been performed

---

# Authentication

## FE-01 — Login with valid credentials

**Priority:** High

**Steps:**
1. Open the Login page.
2. Enter a valid email and password.
3. Click Sign in.

**Expected Result:**
User is redirected to the Orders page.

**Result:** PASS

**Actual Behaviour:**
Login was successful and the user was redirected to the Orders page.

**Evidence / Notes:**
Valid mock credentials allowed access to the application.

---

## FE-02 — Login validation with empty fields

**Priority:** High

**Steps:**
1. Open the Login page.
2. Submit with both fields empty.
3. Test with only the email entered.
4. Test with only the password entered.

**Expected Result:**
Login is prevented and validation feedback is displayed.

**Result:** PASS

**Actual Behaviour:**
Missing fields correctly prevented login. The application displayed a general message asking for the email and password.

**Evidence / Notes:**
The functionality works, but the validation message is too general.

Suggested improvement:
- Both missing → "Enter your email and password to continue."
- Email missing → "Enter your email to continue."
- Password missing → "Enter your password to continue."

---

## FE-03 — Protected route while logged out

**Priority:** High

**Steps:**
1. Log out.
2. Enter `/orders` directly in the browser.

**Expected Result:**
User cannot access the protected Orders page and is redirected to Login.

**Result:** PASS

**Actual Behaviour:**
Direct access to `/orders` while logged out redirected to the Login page.

**Evidence / Notes:**
Protected route behaviour worked correctly.

---

## FE-04 — Registration with valid details

**Priority:** High

**Steps:**
1. Open the Register page.
2. Enter valid required details.
3. Submit the registration form.

**Expected Result:**
Registration succeeds and the user reaches the Orders page.

**Result:** PASS

**Actual Behaviour:**
Registration succeeded and the user was redirected to the Orders page. The registered email appeared in the application header.

**Evidence / Notes:**
Valid registration flow worked correctly.

---

## FE-05 — Registration validation

**Priority:** High

**Steps:**
1. Open the Register page.
2. Leave one or more required fields empty.
3. Submit the form.

**Expected Result:**
Registration is prevented and validation feedback is displayed.

**Result:** PASS

**Actual Behaviour:**
Missing required fields prevented registration. The application displayed:

"Fill in name, email and password."

**Evidence / Notes:**
Validation works, but the message is too general and should identify the specific missing field or fields.

Depot / Site is optional and should not be included in required-field validation.

---

# Orders

## FE-06 — Orders list loads

**Priority:** High

**Steps:**
1. Log in.
2. Open the Orders page.

**Expected Result:**
Orders are displayed correctly. If there are no orders, a suitable empty state is displayed.

**Result:** PASS

**Actual Behaviour:**
The Orders page loaded successfully and displayed an empty state with 0 orders when no orders existed.

**Evidence / Notes:**
Empty order state displayed correctly.

---

## FE-07 — Open existing order

**Priority:** High

**Steps:**
1. Open the Orders page.
2. Select an existing order.

**Expected Result:**
The correct Order Details page opens.

**Result:** PASS

**Actual Behaviour:**
Existing order `ORD-001` appeared in the Orders list with Draft status and could be opened successfully.

**Evidence / Notes:**
Correct order information was displayed.

---

## FE-08 — Invalid order ID

**Priority:** Medium

**Steps:**
1. While logged in, attempt to open an invalid order ID such as `/orders/ORD-999999`.

**Expected Result:**
A clear not-found or error state is displayed without crashing the application.

**Result:** BLOCKED

**Actual Behaviour:**
Entering the invalid order URL directly caused the application to reload and return to the Login page because the mocked authentication state was lost.

**Evidence / Notes:**
Invalid-order handling could not be tested while authenticated through direct URL navigation.

This is currently a limitation of the mocked authentication implementation.

---

# Order Creation

## FE-09 — Create a valid order

**Priority:** High

**Steps:**
1. Open New Order.
2. Enter an order reference.
3. Add at least one valid item.
4. Click Create order.

**Expected Result:**
The order is created and its Order Details page is displayed.

**Result:** PASS

**Actual Behaviour:**
A valid order was created successfully as `ORD-001` and the application redirected to its Order Details page.

**Evidence / Notes:**
Order information and totals were displayed correctly.

---

## FE-10 — Missing order reference

**Priority:** High

**Steps:**
1. Open New Order.
2. Leave Order Reference empty.
3. Add a valid item.
4. Attempt to create the order.

**Expected Result:**
Order creation is prevented and a clear validation message is displayed.

**Result:** PASS

**Actual Behaviour:**
Order creation was prevented.

**Evidence / Notes:**
The application displayed:

"Add a reference so the depot can identify this order."

The message clearly explained the problem.

---

## FE-11 — Create order with no items

**Priority:** High

**Steps:**
1. Open New Order.
2. Enter a valid Order Reference.
3. Do not add any items.
4. Click Create order.

**Expected Result:**
Order creation is prevented and the user is told that at least one item is required.

**Result:** PASS

**Actual Behaviour:**
Order creation was blocked when no items were present.

**Evidence / Notes:**
The application displayed:

"The server rejected this order. Check the item details."

The order was correctly rejected, but the message could be clearer.

Suggested message:

"Add at least one item before creating the order."

---

# Item Entry and Validation

## FE-12 — Add a valid item

**Priority:** High

**Steps:**
1. Open New Order.
2. Enter valid item details.
3. Add the item.

**Expected Result:**
The item appears in the order item list with the entered details.

**Result:** PASS

**Actual Behaviour:**
The valid item was added successfully and appeared in the order.

**Evidence / Notes:**
Valid item entry worked correctly.

---

## FE-13 — Required item validation

**Priority:** High

**Steps:**
1. Leave one required item field empty.
2. Fill the remaining required fields.
3. Attempt to add the item.

**Expected Result:**
The item is not added and appropriate validation feedback is displayed.

**Result:** PASS

**Actual Behaviour:**
Missing required item data prevented the item from being added. The application displayed:

"Item code, reference, dimensions and weight are required."

**Evidence / Notes:**
The validation works, but the message is too general.

It should identify the specific missing field or fields rather than listing every required field.

---

## FE-14 — Invalid numeric item values

**Priority:** High

**Steps:**
1. Enter invalid numeric item values.
2. Test zero dimensions.
3. Test negative weight.
4. Test weight above the maximum.
5. Attempt to add the item.

**Expected Result:**
Invalid numeric values are rejected before the item is added.

**Result:** FAIL

**Actual Behaviour:**
Negative weight values were prevented by input validation. For example, entering `-1` displayed a message stating that the value must be greater than or equal to 0.

Weight values above the 32 kg maximum were also rejected.

However, dimensions of `0 × 0 × 0 mm` were accepted by the frontend and the item could be added to the order. The invalid order was only rejected later by the backend when attempting to create it.

**Evidence / Notes:**
Observed behaviour:

- Negative weight (`-1`) → rejected
- Weight `0` → allowed by the current frontend input constraint
- Weight above `32 kg` → rejected
- Dimensions `0 × 0 × 0 mm` → accepted into the frontend order
- Creating an order containing zero dimensions → rejected by the backend

Frontend dimension validation should prevent invalid zero dimensions before an item is added.

Whether a weight of exactly `0 kg` should be accepted requires confirmation from the project requirements.

---

## FE-15 — Remove item

**Priority:** High

**Steps:**
1. Add two valid items.
2. Note the order summary.
3. Remove one item.

**Expected Result:**
Only the selected item is removed and the order totals update correctly.

**Result:** PASS

**Actual Behaviour:**
The selected item was removed successfully and the order summary updated correctly.

**Evidence / Notes:**
Line-item, unit and weight totals were recalculated after removal.

---

## FE-16 — Quantity and total weight

**Priority:** High

**Steps:**
1. Add an item with quantity greater than 1.
2. Check Total Units.
3. Check Total Weight.

**Expected Result:**
Quantity and total weight are calculated correctly.

**Result:** PASS

**Actual Behaviour:**
Quantity and total weight were calculated correctly.

**Evidence / Notes:**
A quantity of 2 with an item weight of 5 kg produced a total weight of 10 kg.

---

## FE-18 — Optional Box Group

**Priority:** Medium

**Steps:**
1. Enter a valid item.
2. Leave Box Group empty.
3. Add the item.

**Expected Result:**
The item is added without requiring a Box Group.

**Result:** PASS

**Actual Behaviour:**
The item was added successfully with Box Group left empty.

**Evidence / Notes:**
The item displayed `--` for Box Group.

---

# Packing

## FE-19 — Pack existing order

**Priority:** High

**Steps:**
1. Create or open a valid saved order.
2. Click Pack this order.
3. Wait for the packing operation to complete.

**Expected Result:**
Packing succeeds and the packing results are displayed.

**Result:** PASS

**Actual Behaviour:**
Packing completed successfully for `ORD-002`. The order status changed to Packed and packing results appeared.

**Evidence / Notes:**
Observed results:

- Boxes: 2
- Items Packed: 14
- Rejected: 0

The Fill Rate displayed `0%`. This should be reviewed when the packing solution and summary tests are completed.

---

## FE-20 — Repeated packing

**Priority:** Medium

**Steps:**
1. Open an order that has already been packed.
2. Click Pack again.
3. Observe the application response.

**Expected Result:**
The application should either perform the repacking operation or clearly explain why the action cannot be performed.

**Result:** FAIL

**Actual Behaviour:**
The "Pack again" button was available, but clicking it produced no visible action, feedback or updated result.

**Evidence / Notes:**
The UI should provide clear feedback when Pack again is selected.

---

## FE-21 — Packing failure

**Priority:** High

**Steps:**
1. Cause or simulate a packing/API failure.
2. Attempt to pack an order.

**Expected Result:**
A clear error is displayed and the user can recover or retry.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

## FE-22 — Packing solution

**Priority:** High

**Steps:**
1. Pack a valid order.
2. Review the returned packing solution.

**Expected Result:**
Packing solution information is displayed correctly.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

## FE-23 — Packing summary

**Priority:** High

**Steps:**
1. Pack a valid order.
2. Review the packing summary.
3. Check totals and calculated values.

**Expected Result:**
Packing summary values correctly represent the returned solution.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
The observed `0%` Fill Rate from FE-19 should be investigated during this test.

---

# FitVisualiser

## FE-24 — FitVisualiser available

**Priority:** Medium

**Steps:**
1. Start FitVisualiser on port 5173.
2. Pack an order.
3. Open the visualisation.

**Expected Result:**
The packing solution opens successfully in FitVisualiser.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested because FitVisualiser was not running.

**Evidence / Notes:**
Requires the separate FitVisualiser application.

---

## FE-25 — FitVisualiser unavailable

**Priority:** Medium

**Steps:**
1. Leave FitVisualiser stopped.
2. Pack an order.
3. Attempt to open the visualisation.

**Expected Result:**
FitPortal should remain usable even when the external visualiser is unavailable.

**Result:** PASS

**Actual Behaviour:**
The FitVisualiser link attempted to open `http://localhost:5173`, but Safari could not connect because FitVisualiser was not running.

Core FitPortal packing results remained available.

**Evidence / Notes:**
FitPortal remained usable without FitVisualiser.

A possible usability improvement would be to detect when FitVisualiser is unavailable and display a clearer message instead of relying on the browser connection error.

---

# API Failure Handling

## FE-26 — Portal API unavailable

**Priority:** High

**Steps:**
1. Stop the Portal API.
2. Perform an action that requires the API.

**Expected Result:**
The frontend displays a clear failure state and does not crash.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

# Responsive Layout and Accessibility

## FE-27 — Mobile layout

**Priority:** Medium

**Steps:**
1. Open FitPortal using a mobile-sized viewport.
2. Navigate through the main pages.

**Expected Result:**
Content remains readable and usable without major layout problems.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

## FE-28 — Tablet and desktop layout

**Priority:** Medium

**Steps:**
1. Test the application using tablet and desktop viewport sizes.
2. Navigate through the main pages.

**Expected Result:**
Layout adapts correctly and remains usable.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

## FE-29 — Keyboard and focus

**Priority:** Medium

**Steps:**
1. Navigate through forms and controls using the keyboard.
2. Check focus behaviour.

**Expected Result:**
Interactive controls can be reached and used using the keyboard and focus is understandable.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

# Navigation

## FE-30 — Sign out

**Priority:** High

**Steps:**
1. Log in.
2. Click Sign out.

**Expected Result:**
The user is signed out and returned to the Login page.

**Result:** NOT RUN

**Actual Behaviour:**
Not formally tested yet.

**Evidence / Notes:**
Although logout was used during other tests, this test should be completed independently before marking it PASS.

---

## FE-31 — Unknown route

**Priority:** Medium

**Steps:**
1. Enter a route that does not exist.

**Expected Result:**
The application handles the unknown route without crashing and displays or redirects to an appropriate page.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

# Build and Responsiveness

## FE-32 — Production build

**Priority:** High

**Steps:**
1. Open the frontend directory.
2. Run:

```bash
npm run build
```

**Expected Result:**
The production build completes successfully without build errors.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.

---

## FE-33 — Basic UI responsiveness

**Priority:** Medium

**Steps:**
1. Navigate between main pages.
2. Open forms and orders.
3. Perform common frontend actions.
4. Observe responsiveness.

**Expected Result:**
The interface responds normally without freezing, major delays or unexpected crashes.

**Result:** NOT RUN

**Actual Behaviour:**
Not tested yet.

**Evidence / Notes:**
Complete in a future test run.