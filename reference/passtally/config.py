"""Every rule constant for the engine. Nothing else belongs here."""

from __future__ import annotations

# Board dimension. Parameterised everywhere; nothing may assume this value.
N = 6  # TODO: verify against rulebook

# Whether markers may travel around a corner onto the adjacent edge.
# Only True is implemented; see ring.Ring.
RING_CONTINUOUS = True  # TODO: verify against rulebook

# The rules give two contradictory end-of-game timings. We implement the
# round-completion path; this flag marks the unimplemented alternative.
END_IMMEDIATELY_ON_EMPTY = False  # TODO: verify against rulebook

N_PILES = 3
COPIES_PER_TYPE = 7
TILES_PER_PILE = 14
ACTIONS_PER_TURN = 2
MARKERS_PER_PLAYER = 4
MARKER_DISTANCES = (-2, -1, 1, 2)

# (min_passes, victory_points), ascending. Look up by taking the last entry
# whose min_passes <= total. Band widths are the natural numbers, so every
# threshold is 1 + n(n-1)/2 -- but the top band breaks the pattern by jumping
# to 15 VP, so this stays a literal table rather than a formula.
PASSES_TO_VP: list[tuple[int, int]] = [
    (0, 0),
    (1, 1),
    (2, 2),
    (4, 3),
    (7, 4),
    (11, 5),
    (16, 6),
    (22, 7),
    (29, 8),
    (37, 9),  # TODO: source table read "31-45", which overlapped "29-36"
    (46, 10),
    (56, 15),
]
