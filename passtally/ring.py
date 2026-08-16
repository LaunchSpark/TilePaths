"""The border ring.

This class is the single seam for the corner-continuity rule. If markers turn
out to be blocked at corners, only `move` changes -- nothing else in the engine
knows how ring indices relate to board edges.
"""

from __future__ import annotations

from passtally import config


class Ring:
    def __init__(self, n: int, continuous: bool = config.RING_CONTINUOUS) -> None:
        if not continuous:
            raise NotImplementedError(
                "Only the continuous ring is implemented. To block markers at "
                "corners, reimplement Ring.move -- no other module needs to change."
            )
        self.n = n
        self.size = 4 * n
        self.continuous = continuous

    def move(self, slot: int, distance: int) -> int:
        """Raw ring arithmetic. Ignores occupancy -- see markers.marker_destination."""
        return (slot + distance) % self.size
