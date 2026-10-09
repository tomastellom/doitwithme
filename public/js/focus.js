export function findByKey(node, key) {
  if (!node || !node.children) return null;
  if (node.getAttribute && node.getAttribute('data-fk') === key) return node;
  for (const child of node.children) {
    const found = findByKey(child, key);
    if (found) return found;
  }
  return null;
}

// Screens are rebuilt on every change. The keeper remembers which control had keyboard
// focus (by its data-fk key) and puts it back on the new element. A disabled control
// cannot take focus, so its key stays pending until the next redraw.
export function createFocusKeeper({ document, getRoot, fallback }) {
  let pending = null;
  return {
    capture() {
      const active = document.activeElement;
      const key = active && active.getAttribute ? active.getAttribute('data-fk') : null;
      if (key) return key;
      const onBody = !active || active.tagName === 'BODY';
      return onBody ? pending : null;
    },
    restore(key) {
      pending = null;
      if (!key) return;
      const target = findByKey(getRoot(), key);
      if (target) {
        target.focus();
        if (document.activeElement !== target) pending = key;
      } else if (key.startsWith('nudge-')) {
        fallback();
      }
    },
  };
}
