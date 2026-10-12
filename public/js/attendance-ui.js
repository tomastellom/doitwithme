export const VERDICT_WORDS = { go: 'Go', skippable: 'Skippable', optional: 'Optional', unknown: 'No advice yet' };

// What the rule thinks about going to this class. Plain words, never a decision.
export function adviceBlock(dom, advice) {
  const { h } = dom;
  return h('div', { class: 'advice', 'data-verdict': advice.verdict },
    h('span', { class: 'tag' }, VERDICT_WORDS[advice.verdict]),
    advice.reasons.map((r) => h('p', { class: 'reason' }, r)),
    h('span', { class: 'note2' }, 'Advice only. You decide.'));
}
