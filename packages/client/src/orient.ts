import { distinctOrientations, offsetOf } from "@passtally/rules";
import type { Pos, TypeId } from "@passtally/rules";

export function normalizePlacement(
  typeId: TypeId,
  anchor: Pos,
  orientation: number,
): { anchor: Pos; orientation: number } {
  if (distinctOrientations(typeId).includes(orientation)) return { anchor, orientation };
  const [dr, dc] = offsetOf(orientation);
  return { anchor: [anchor[0] + dr, anchor[1] + dc], orientation: (orientation + 2) % 4 };
}
