/** Hängt den Knoten an den Body: ein Vorfahr mit transform, overflow oder eigenem Stapelkontext würde `position: fixed` einsperren. */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return { destroy: () => node.remove() };
}
