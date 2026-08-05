# Architecture

How the solver is put together, and why. Read
[`client-requirements.md`](client-requirements.md) first.

The shape below is driven by one thing the client said repeatedly: he wants this **extensible**, and
the concrete extension he named is **modes**. So the design's job is to make "add fluid mode" a new
file rather than a rewrite.

## The pipeline

```
  request  ->  validate  ->  expand  ->  select  ->  place  ->  measure  ->  response
                              units      boxes      items      utilisation
```

| Stage | Does what |
|---|---|
| **validate** | Reject malformed input early with a clear reason. Schema plus sanity, for example an item bigger than every box is `NO_BOX_FITS` before we try to pack anything. |
| **expand** | Turn order *lines* into *units*. `quantity: 3` becomes three things to place. Everything after this point deals in units. |
| **select** | Decide which box type to open next. |
| **place** | Decide where a unit goes inside an open box. **This is the mode-specific part.** |
| **measure** | Volume and weight utilisation, timings, and derive `status`. |

Only **place** differs between modes. Standard mode does real geometry. Fluid mode compares total
volumes and skips geometry entirely. Own-packaging mode short-circuits before `select`. Everything
else is shared, which is exactly the point.

## The pieces

### Domain

Plain data with behaviour, no I/O, no framework.

- **`Dimensions`** — width, height, depth. Integer millimetres. Knows its volume, and which
  orientations of itself fit inside another `Dimensions`.
- **`BoxType`** — a type of carton the warehouse stocks: interior dimensions, weight limit, tare
  weight, how many are on hand. The client's "same abstraction for a shipping container and a small
  parcel" lands here.
- **`Item`** — a line: dimensions, weight, quantity, group tags.
- **`Unit`** — one physical thing to place. Produced by expanding an `Item`.
- **`Placement`** — a unit at a position, with its size as placed.
- **`Container`** — one physical box in progress: a `BoxType` plus the placements in it, plus
  whatever free space bookkeeping the mode needs. Answers "can this unit go in, and where?"
- **`RuleSet`** — the group incompatibility rules. Answers "may this unit join this container?"

### Packing strategy

The interface every mode implements. Give it units and box types, get back containers and whatever
could not be placed. Modes are registered by name so `mode` in the request picks one, and adding a
mode means adding a class and registering it.

### Placement heuristics

Inside standard mode, how we choose a spot. Start with the simplest thing that works and improve it,
measuring against the same example inputs each time:

1. **First fit decreasing.** Sort units largest first, drop each into the first container it fits.
   The baseline. Simple, fast, and surprisingly hard to beat by much.
2. **Extreme points.** Track candidate corners created by each placement rather than scanning a
   grid. The usual next step, and where most of the real gain is.
3. **Best fit / lookahead.** Try several candidate positions and score them on wasted space.

Record what each one scores. That comparison is genuinely good evidence for the unit's Development
Process mark, and it is the honest answer to "how do you know it is efficient?"

## Rules that shaped this

**Integer millimetres and grams, everywhere.** No floats. Two items 0.1 mm apart from float drift is
a bug you cannot see and cannot reproduce. See
[ADR-0002](decisions/0002-units-and-coordinates.md).

**Rotation is resolved before the response leaves us.** The contract carries size *as placed*. The
visualiser team should never do geometry maths. Assumes rotation is allowed at all, which is
[open question 1](client-requirements.md#open-questions-for-the-client).

**`step` is global and gap-free.** The client's step-by-step view is the differentiator, so the
ordering is a first-class output, not something a consumer reconstructs. `tools/validate-contract.py`
enforces it.

**Weight fields are modelled but not enforced.** The client said they are not hitting the limit yet.
Carrying the fields now means enforcing them later is a check, not a schema change.

**No persistence, no auth, no queue.** One request in, one response out. The client ruled auth out,
and the load numbers do not justify a queue.

## Performance

The bar is 1 to 2 seconds for a single order, so the target is a **single order**, not aggregate
throughput. Do not spend the semester on concurrency.

3D bin packing is NP-hard. We are not proving optimality, we are finding a good answer fast, and the
honest framing in the report is "heuristic, measured against these benchmarks" rather than any claim
of optimality.

Practical guidance: get it correct first, measure with a realistic order, then optimise only what
the measurement says is slow. `metrics.solveTimeMs` is in every response so we always have the
number.

## Testing

Taren's rule from Wasif's other project applies here too and is a good habit regardless: **whoever
writes the implementation should not also write its tests.** Pair up across the team.

Four things worth testing, in rough order of value:

1. **Geometry invariants.** Nothing sticks out of a box, nothing overlaps. This is the bug class
   that a human eyeballing a visualiser will not catch reliably.
   `tools/validate-contract.py` already implements both checks.
2. **Rules.** Two incompatible groups never end up in the same container.
3. **Conservation.** Every unit in the request appears exactly once, either placed or in `unpacked`.
   Easy to get wrong, easy to test, and embarrassing to ship.
4. **Contract.** Every example validates. Wire this into CI.

Property-based testing suits 1 and 3 unusually well: generate random orders, assert the invariants.
Worth a look once the basics pass.
