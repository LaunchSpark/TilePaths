let preview: HTMLCanvasElement | null = null;

function position(clientX: number, clientY: number): void {
  if (preview === null) return;
  preview.style.left = `${clientX}px`;
  preview.style.top = `${clientY}px`;
}

export function startDragPreview(
  source: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  orientation: number,
): void {
  endDragPreview();

  preview = document.createElement("canvas");
  preview.width = source.width;
  preview.height = source.height;
  preview.className = "tile-drag-preview";
  preview.getContext("2d")?.drawImage(source, 0, 0);
  document.body.append(preview);
  position(clientX, clientY);
  rotateDragPreview(orientation);
}

export function moveDragPreview(clientX: number, clientY: number): void {
  position(clientX, clientY);
}

export function rotateDragPreview(orientation: number): void {
  if (preview === null) return;
  preview.style.transform = `translate(-50%, -50%) rotate(${orientation * 90}deg)`;
}

export function endDragPreview(): void {
  preview?.remove();
  preview = null;
}

export function isDragPreviewActive(): boolean {
  return preview !== null;
}
