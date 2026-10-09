const SVG_NS = 'http://www.w3.org/2000/svg';

export function createDom(doc) {
  const flatten = (list) => list.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);

  function apply(el, props) {
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value') el.value = value;
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }

  function build(el, props, children) {
    apply(el, props);
    for (const child of flatten(children)) {
      el.append(typeof child === 'object' ? child : doc.createTextNode(String(child)));
    }
    return el;
  }

  return {
    h: (tag, props, ...children) => build(doc.createElement(tag), props, children),
    svg: (tag, props, ...children) => build(doc.createElementNS(SVG_NS, tag), props, children),
    text: (value) => doc.createTextNode(String(value)),
    clear: (el, ...children) => el.replaceChildren(...flatten(children)),
  };
}
