# Reference implementation

This is the original Python rules engine. **It is not shipped and it is not maintained as a
parallel implementation.** It exists for one purpose: to be an independent implementation that
the TypeScript port in `packages/rules` can be checked against.

## Why it is still here

`packages/rules` is a port of this engine. A port is exactly where correctness regresses
silently, so `gen_oracle.py` runs random playouts through *this* engine and records a portable
state digest after every action. The TypeScript suite replays those fixtures and must match at
every step. That gives the port something the Python engine never had for itself: an
independent implementation to disagree with.

The last full run: **25 fixtures, 2,003 per-action digest comparisons, zero divergence.**

## Do not modify

Changing anything under `passtally/` or `tests/` invalidates the comparison — the oracle is only
meaningful while the reference stays put. If a rule genuinely changes, change it in
`packages/rules`, regenerate the fixtures deliberately, and record why.

The one exception is `gen_oracle.py`, which is tooling rather than reference, and may change.

## Running it

```bash
cd reference && python -m pytest        # 182 tests
python reference/gen_oracle.py          # regenerates packages/rules/test/fixtures/oracle
```

The generator resolves paths from its own location, so it runs from any directory. Regenerating
should produce byte-identical fixtures — its RNG is seeded with a fixed value. If it does not,
either the reference changed or the fixture format did, and both are worth stopping over.

## Layout

| Path | What |
| ---- | ---- |
| `passtally/` | the engine, 833 lines, unchanged since the port began |
| `tests/` | its 182 tests |
| `gen_oracle.py` | emits the differential fixtures |
| `pyproject.toml` | packaging and pytest config |

## Design authority

`docs/superpowers/specs/2026-08-15-passtally-engine-design.md` documents the rules and is
language-agnostic — it remains the authority for both implementations.
