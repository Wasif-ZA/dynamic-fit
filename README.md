# COMP4050-2026-Discovery-Visualiser

## Running Visualiser
Installing Packages:
```
npm install
```

Running Program:
```
npx vite
```

## MVP Definition

The MVP is the product with the minimum amount of features added in order to meet the main functionality requirements of the product. The Discovery Visualiser MVP must meet the following requirements.

| Requirement ID | Title | Description |
| ----- | ----- | ---------- |
| Req01 | Read in Solver solution JSON File | Visualiser SHALL read all packing info from a JSON file which is passed as a prop into the `<canvas>` tag in HTML. |
| Req02 | Output 3D Scene with Boxes | The program SHALL visualise a 3D scene with each box (and all its items) supplied in the JSON file with accurate scale and coordinates. |
| Req03 | Scene Movement Controls | The user SHALL be able to rotate, dolly/pan and move the camera using mouse/trackpad and touch controls. |
| Req04 | UI Legend for each Box and Items | An `<aside>` SHALL display a scrollable legend that displays each box and its items with all relevant information. It SHALL also be resized for optimal mobile usage. |
| Req05 | Displaying Item Rejections | The `<aside>` SHALL display the list of rejected items, if any, after the list of boxes. |
| Req06 | Return to Portal Functionality | UI will display a "DONE" and a "CANCEL" button to return to the Portal Page, it will return the values String OrderID and Bool Complete. |

## Additional Functionality Requirements

These are requirements that surpass the MVP

| Requirement ID | Title | Description |
| ----- | ----- | ---------- |
| Req07 | Presenting Each Box with LEGO-like Instructions | The user SHALL be able to click a button on the aside UI to view the step-by-step packing order of a single box with progression bar, side arrows to step through, and exit button. |