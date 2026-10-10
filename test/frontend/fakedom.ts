export class FakeText {
  text: string;
  constructor(text: string) {
    this.text = text;
  }
  get textContent(): string {
    return this.text;
  }
}

export class FakeStyle {
  [k: string]: any;
  setProperty(k: string, v: string): void {
    this[k] = v;
  }
}

export class FakeElement {
  style = new FakeStyle();
  tag: string;
  ns: string | null;
  doc: FakeDocument;
  attrs: Record<string, string> = {};
  children: Array<FakeElement | FakeText> = [];
  listeners: Record<string, Function[]> = {};
  value = '';
  parent: FakeElement | null = null;

  constructor(tag: string, ns: string | null, doc: FakeDocument) {
    this.tag = tag;
    this.ns = ns;
    this.doc = doc;
  }
  setAttribute(k: string, v: unknown): void {
    this.attrs[k] = String(v);
  }
  getAttribute(k: string): string | null {
    return k in this.attrs ? this.attrs[k] : null;
  }
  hasAttribute(k: string): boolean {
    return k in this.attrs;
  }
  removeAttribute(k: string): void {
    delete this.attrs[k];
  }
  get className(): string {
    return this.attrs.class ?? '';
  }
  hasClass(c: string): boolean {
    return this.className.split(/\s+/).includes(c);
  }
  get tagName(): string {
    return this.tag.toUpperCase();
  }
  append(...nodes: Array<FakeElement | FakeText>): void {
    for (const n of nodes) {
      if (n instanceof FakeElement) n.parent = this;
      this.children.push(n);
    }
  }
  appendChild(n: FakeElement | FakeText): FakeElement | FakeText {
    this.append(n);
    return n;
  }
  replaceChildren(...nodes: Array<FakeElement | FakeText>): void {
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type: string, fn: Function): void {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatch(type: string, event: Record<string, unknown> = {}): any {
    const e: any = {
      type,
      target: this,
      defaultPrevented: false,
      cancelBubble: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.cancelBubble = true;
      },
      ...event,
    };
    // Events bubble from the element up through its parents, like in a browser.
    for (let node: FakeElement | null = this; node; node = e.cancelBubble ? null : node.parent) {
      for (const fn of node.listeners[type] ?? []) fn(e);
    }
    return e;
  }
  click(): any {
    return this.dispatch('click');
  }
  focus(): void {
    this.doc.activeElement = this;
  }
  get textContent(): string {
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v: string) {
    this.children = [new FakeText(String(v))];
  }
}

export class FakeDocument {
  activeElement: FakeElement | null = null;
  listeners: Record<string, Function[]> = {};
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, null, this);
  }
  createElementNS(ns: string, tag: string): FakeElement {
    return new FakeElement(tag, ns, this);
  }
  createTextNode(text: string): FakeText {
    return new FakeText(text);
  }
  addEventListener(type: string, fn: Function): void {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatch(type: string, event: Record<string, unknown> = {}): any {
    const e: any = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...event };
    for (const fn of this.listeners[type] ?? []) fn(e);
    return e;
  }
}

export function findAll(root: FakeElement, predicate: (el: FakeElement) => boolean): FakeElement[] {
  const out: FakeElement[] = [];
  const walk = (node: FakeElement | FakeText) => {
    if (!(node instanceof FakeElement)) return;
    if (predicate(node)) out.push(node);
    node.children.forEach(walk);
  };
  walk(root);
  return out;
}
export const byClass = (root: FakeElement, c: string) => findAll(root, (e) => e.hasClass(c));
export const byTag = (root: FakeElement, tag: string) => findAll(root, (e) => e.tag === tag);
export const textOf = (root: FakeElement) => root.textContent;
