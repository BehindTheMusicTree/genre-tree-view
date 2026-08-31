// Both the plain (M...L) and radial-curved (M...C...) link path shapes drawn by this package
// start with an absolute moveto to the source point and end their final segment at the target
// point, so this extracts just those endpoints regardless of which shape produced the string.
export function linkPathEndpoints(d: string): { start: [number, number]; end: [number, number] } {
  const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return {
    start: [numbers[0], numbers[1]],
    end: [numbers[numbers.length - 2], numbers[numbers.length - 1]],
  };
}
