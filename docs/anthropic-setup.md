# Connecting the AI (Claude)

The AI is optional. Without it, "Estimate hours" gives the rule of thumb only. With it, the card also shows Claude's suggestion, based on the course details and the syllabus you paste. Claude's answer is always kept between half and double the rule of thumb, and you decide whether to use it.

## What it costs

The app calls the Claude API, which is billed separately from a Claude chat subscription. It uses the cheapest model, Claude Haiku 5.5, and one estimate is a short question and answer, so it costs roughly a tenth of a cent (at $0.10 per million input tokens and $0.50 per million output tokens). Check Anthropic's current prices: https://platform.claude.com/docs/en/about-claude/pricing

There is no loop: it runs only when you press "Estimate hours".

## Steps

1. Go to https://console.anthropic.com and sign in or create an account.
2. Add credit under Billing (a small prepaid amount, for example 5 dollars, lasts a very long time at this price). Turn auto-reload off.
3. Set a monthly spend limit under Limits, for example 5 dollars, as a safety net.
4. Create a key under API keys. Copy it once; you cannot see it again.
5. Start the planner with the key in the environment, typed into your own Terminal (not through Claude Code, and not pasted into a chat):

   read -s DOITWITHME_ANTHROPIC_KEY
   export DOITWITHME_ANTHROPIC_KEY
   npm run serve

   `read -s` waits for you to paste the key and shows nothing as you paste. Press Return, then run the other two lines. This keeps the key out of your shell history. The server prints "The AI is connected (claude-haiku-5-5)." and never the key. If the key has a stray line break or a curly quote from copying, the server says the AI is not connected and why.
6. Open Plan, Tasks, a study task with credits, and press **Estimate hours**. The card shows the AI's answer and the rule of thumb.

To connect Google Maps too, set `GOOGLE_MAPS_API_KEY` the same way before `npm run serve`.

## Important: do not use the name ANTHROPIC_API_KEY

The planner reads `DOITWITHME_ANTHROPIC_KEY` on purpose. If you set a variable called `ANTHROPIC_API_KEY` in your shell, Claude Code (the tool you may use with a subscription) notices it and switches to pay-per-use billing instead of your subscription. Use the name `DOITWITHME_ANTHROPIC_KEY` as above.

## A different model

Set `DOITWITHME_AI_MODEL` (for example `claude-sonnet-5-5`) to use another model. It must be a current model that supports the `effort` setting and structured answers (Haiku 5.5, Sonnet 5.5, Opus 5.5 and later); older models such as Haiku 4.5 will always fail with "The AI could not use that request." Bigger models read a long syllabus more carefully and cost more, roughly a cent or two per estimate for Sonnet. The default is `claude-haiku-5-5`.

## What the messages mean

- "The AI key was rejected. Check the key you started the planner with." The key is wrong, was deleted, or has no permission.
- "The AI account has no credit left. Add credit in the Anthropic console." Add credit under Billing.
- "The AI is busy right now. Try again in a moment." Press Estimate hours again.
- "The AI took too long. Try again." It did not answer within 15 seconds.
- "The AI could not use that request." The model name is wrong, or the model does not support what the planner asks for. Check `DOITWITHME_AI_MODEL`.
- "The AI had a problem. Try again later." Anthropic had a hiccup.
- "The AI declined to answer this one." The rule of thumb is shown instead.
- "The AI answered in a way I could not read." Try again.
- "I could not reach the AI." You are offline.
- "The AI could not answer this time. The rule of thumb is shown." Something unexpected went wrong. Try again.

When anything fails, the rule of thumb is still shown and nothing breaks. Never paste the key into the app, a file in this folder, or a chat. If it leaks, delete it in the console and make a new one.

## Nudge chat

Once the AI is connected, the box in Nudge's bubble ("Ask me about your plan") answers questions such as "when is my next lesson with Ana?" or "find me two free hours for the essay this week". It only reads: it never changes your plan.

What it sends to Anthropic with each message: a summary of the next four weeks (event, planned work and deadline titles, dates and times, and your task list), your last 10 chats, and your question. When the AI needs more, it looks things up in your planner on this computer, and what it finds (which can include addresses and course text) is sent back to answer. Nothing is sent until you press Enter.

Cost: on the cheapest model, about a tenth of a cent for a simple question and a few tenths when it looks things up. There is a limit of 30 messages a day; the Anthropic spend limit you set remains the final safety net.

Your chats are saved next to your planner data, in `data/db.chat.json` (the last 200). The Earlier button in the bubble shows them and can delete them.
