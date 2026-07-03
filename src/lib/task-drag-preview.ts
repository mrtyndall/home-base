const dragPreviewOffset = 12;

export function getTaskDragPreviewPosition(clientX: number, clientY: number) {
  return {
    left: clientX + dragPreviewOffset,
    top: clientY + dragPreviewOffset,
  };
}
