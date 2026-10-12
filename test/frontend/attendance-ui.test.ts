import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDom } from '../../public/js/dom.js';
import { VERDICT_WORDS, adviceBlock } from '../../public/js/attendance-ui.js';
import { FakeDocument, byClass, textOf } from './fakedom.ts';

const dom = createDom(new FakeDocument() as any);

test('each verdict has its word, its reasons and the reminder that the user decides', () => {
  for (const [verdict, word] of Object.entries(VERDICT_WORDS)) {
    const el: any = adviceBlock(dom, { commitmentId: 'lec', date: '2026-10-05', verdict, reasons: ['First.', 'Second.'] } as any);
    assert.equal(el.getAttribute('data-verdict'), verdict);
    assert.equal(textOf(byClass(el, 'tag')[0]), word);
    assert.equal(byClass(el, 'reason').length, 2);
    assert.match(textOf(el), /Advice only\. You decide\./);
  }
});

test('hostile reason text stays plain text', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const el: any = adviceBlock(dom, { commitmentId: 'lec', date: '2026-10-05', verdict: 'go', reasons: [evil] } as any);
  assert.equal(textOf(byClass(el, 'reason')[0]), evil);
});
