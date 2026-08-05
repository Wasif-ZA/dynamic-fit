# Architecture

How the solver is put together, and why. Read
[`client-requirements.md`](client-requirements.md) first, then [`contract.md`](contract.md).

Written in C++ ([ADR-0004](decisions/0004-cpp-implementation.md)).

The shape below is driven by one thing the client said repeatedly: he wants this **extensible**, and
the concrete extension he named is **modes**. So the design's job is to make "add fluid mode" a new
file rather than a rewrite.

## The pipeline

```
  request  ->  validate  ->  expand  ->  select  ->  place  ->  measure  ->  response
                              units      boxes      units      utilisation
```

| Stage | Does what |
|---|---|
| **validate** | Reject malformed input early with a clear reason. An item bigger than every box is `NO_BOX_FITS` before we try to pack anything. |
| **expand** | Turn order *lines* into *units*. `quantity: 3` becomes three things to place. Everything after this deals in units. |
| **select** | Decide which box type to open next. |
| **place** | Decide where a unit goes inside an open container. **This is the mode-specific part.** |
| **measure** | Volume and weight utilisation, timings, derive `status`. |

Only **place** differs between modes. Standard mode does real geometry. Fluid mode compares total
volumes and skips geometry. Own-packaging short-circuits before `select`. Everything else is shared,
which is the whole point.

## Proposed layout

```
include/dynamicsolver/     public headers, what a consumer includes
  geometry.hpp             Dimensions, Position, Orientation
  domain.hpp               BoxType, Item, Unit, Placement, Container
  rules.hpp                RuleSet
  strategy.hpp             PackingStrategy interface
  solver.hpp               the one entry point
src/
  geometry.cpp
  domain.cpp
  rules.cpp
  strategy/
    standard.cpp           the mode we build
    registry.cpp           name -> strategy
  io/
    json.cpp               contract <-> domain types. Isolated on purpose
  solver.cpp
tests/
apps/
  cli.cpp                  read a request on stdin, write a response on stdout
```

**The JSON layer is deliberately isolated.** Domain types know nothing about JSON. That keeps the
geometry testable without parsing anything, and means a contract change touches one directory.

## Types

### Geometry

Value types. Small, copyable, no allocation, no inheritance.

```cpp
struct Dimensions {          // integer millimetres, always > 0
    int width, height, depth;

    [[nodiscard]] std::int64_t volume() const noexcept;
    [[nodiscard]] bool fitsInside(const Dimensions& outer) const noexcept;
};

struct Position {            // corner nearest the origin, never a centre
    int x, y, z;
};
```

**`volume()` returns `std::int64_t`, not `int`.** A shipping container is about 12000 x 2400 x 2600
mm, which is roughly 7.5e10 and overflows a 32-bit int by a factor of 35. Signed overflow is
undefined behaviour, so this is not a wrong number, it is a bug the optimiser is allowed to make
arbitrarily weird. Get it right in the type from day one.

Lengths stay `int`. Millimetres of a warehouse box never approach 2.1 billion.

### Domain

```cpp
class BoxType {              // a TYPE of carton, not a physical box
    std::string id_, name_;
    Dimensions interior_;    // usable space inside, wall thickness excluded
    std::optional<int> maxWeight_;   // grams, gross, includes tare
    int tareWeight_;
    std::optional<int> available_;   // nullopt = effectively unlimited
};
```

This class is where the client's "same abstraction for a shipping container and a small parcel"
lands. He raised it unprompted and it is the clearest thing he asked for on the design side.

```cpp
class Container {            // one PHYSICAL box being filled
public:
    [[nodiscard]] std::optional<Position> findSpotFor(const Unit&) const;
    bool place(const Unit&, Position, Orientation);
    [[nodiscard]] bool accepts(const Unit&, const RuleSet&) const;
private:
    const BoxType* type_;
    std::vector<Placement> placements_;
    // plus whatever free-space bookkeeping the strategy needs
};
```

`findSpotFor` returning `std::optional<Position>` rather than throwing matters. "This does not fit"
is a normal, expected answer that happens thousands of times per solve, not an error.

### Strategy

One abstract base class, one virtual call per solve. This is the extension point.

```cpp
class PackingStrategy {
public:
    virtual ~PackingStrategy() = default;
    [[nodiscard]] virtual PackingResult pack(
        std::span<const Unit> units,
        std::span<const BoxType> boxes,
        const RuleSet& rules) const = 0;
};
```

Adding fluid mode is a new class and a line in the registry. Nothing else changes. That is the
concrete answer to the client's extensibility ask, and it is worth saying so in the report.

## Placement heuristics

Inside standard mode, how we choose a spot. Start with the simplest thing that works, measure, then
improve against the same inputs:

1. **First fit decreasing.** Sort units largest first, drop each into the first container it fits.
   The baseline. Simple, fast, and surprisingly hard to beat by much.
2. **Extreme points.** Track candidate corners created by each placement rather than scanning a
   grid. The usual next step, and where most of the real gain is.
3. **Best fit or lookahead.** Try several candidate positions and score them on wasted space.

Record what each scores on the same orders. That comparison is good evidence for the Development
Process mark, and it is the honest answer to "how do you know it is efficient?"

## C++ specifics worth agreeing up front

**Standard: C++20.** Available in every current compiler. `std::span`, designated initialisers and
concepts all earn their keep here. Avoid C++23 library features; support is still patchy across the
machines the team will actually use.

**Exceptions are for programmer error, not for packing outcomes.** An item that does not fit is a
return value, not a throw. Expected failures go back as `unpacked` entries with a reason. Reserve
throwing for malformed input at the JSON boundary and for genuine invariant violations.

**No raw `new` or `delete`, no owning raw pointers.** Values by default, `std::unique_ptr` when
polymorphism forces it (the strategy registry). Non-owning observation is a reference or a raw
pointer that never deletes.

**Pass by `const&` or `std::span`.** The hot path runs thousands of fit checks per solve. Copying a
vector of units inside a loop is the easiest available performance mistake.

**`[[nodiscard]]` on anything that answers a question.** `findSpotFor` returning a position you
ignore is always a bug.

**Build with sanitizers in debug.** `-fsanitize=address,undefined`. Geometry code with index
arithmetic is exactly the code that benefits, and the integer overflow above is the kind of thing
UBSan catches on the spot.

## Rules that shaped this

**Integer millimetres and grams, everywhere.** No floats in geometry. Two items 0.1 mm apart from
float drift is a bug you cannot see and cannot reproduce. See
[ADR-0002](decisions/0002-units-and-coordinates.md).

**Rotation is resolved before the response leaves us.** The contract carries size *as placed*. The
visualiser team never does geometry maths. This assumes rotation is allowed at all, which is
[open question 1](client-requirements.md#open-questions-for-the-client).

**`step` is global and gap-free.** The client's step-by-step view is the differentiator, so pack
order is a first-class output, not something a consumer reconstructs.

**Weight fields are modelled but not enforced.** He said they are not hitting the limit yet.
Carrying the fields now makes enforcing them later a check, not a schema change.

**No persistence, no auth, no queue.** One request in, one response out. He ruled auth out, and the
load numbers do not justify a queue.

## Performance

The bar is 1 to 2 seconds for a **single order**. Not aggregate throughput. Do not spend the
semester on concurrency.

3D bin packing is NP-hard. We are not proving optimality, we are finding a good answer fast. The
honest framing in the report is "heuristic, measured against these benchmarks", never a claim of
optimality.

Get it correct first, measure with a realistic order, then optimise only what the measurement says
is slow. C++ makes it tempting to micro-optimise early; the algorithm choice will dominate anything
you do at that level. `metrics.solveTimeMs` ships in every response so we always have the number.

## Testing

**Whoever writes the implementation should not also write its tests.** Pair up across the team. The
person who wrote the code shares its blind spots, and their tests confirm what it does rather than
what it should do. This applies to AI-generated code too: do not generate an implementation and its
tests from the same context.

The [contract invariants](contract.md#invariants) are the test list. In rough order of value:

1. **Geometry.** Nothing sticks out of a container, nothing overlaps. Touching faces are legal. This
   is the bug class a human eyeballing a visualiser will not catch reliably.
2. **Conservation.** Every unit appears exactly once, placed or unpacked. Never both, never neither.
   Easy to get wrong, easy to test, embarrassing to ship.
3. **Rules.** Two incompatible groups never share a container.
4. **Steps.** Contiguous `1..n` across the whole response.

Property-based testing suits 1 and 2 unusually well: generate random orders, assert the invariants
hold. Worth doing once the basics pass, and it finds the packing edge cases nobody thinks to write
by hand.
