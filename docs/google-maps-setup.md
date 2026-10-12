# Connecting Google Maps

Maps is optional. Without it, every commute uses the time you type. With it, a commute set to "Google Maps finds it" looks its time up once, keeps it, and checks again every two weeks or when an address changes.

## What it costs

Google gives a free monthly allowance for route lookups (about 10,000 for the basic kind at the time of writing, then about $5 per 1,000). This app counts every lookup and stops at 5,000 a month by default, so a personal planner stays far inside the free allowance. Check Google's current prices before you start: https://developers.google.com/maps/billing-and-pricing/pricing

## Steps

1. Go to https://console.cloud.google.com and create a project (any name).
2. Turn on billing for the project. Google asks for a card even if you stay inside the free allowance.
3. Set a budget alert: Billing, Budgets and alerts, create a budget (for example 5 dollars) with email alerts.
4. Enable the **Routes API**: APIs and Services, Library, search "Routes API", Enable.
5. Create a key: APIs and Services, Credentials, Create credentials, API key.
6. Restrict the key: open it, under API restrictions choose "Restrict key" and tick only **Routes API**. Save.
7. Start the planner with the key in the environment:

   GOOGLE_MAPS_API_KEY=your-key npm run serve

   The server prints "Google Maps is connected." (never the key). Optional: `GOOGLE_MAPS_REGION=es` (two letters) helps Google read incomplete addresses; `MAPS_MONTHLY_LIMIT=2000` lowers the cap.
8. Open Plan, Commutes. Give both places a full address, choose "Google Maps finds it", pick how you travel and save. The form shows "Google found NN min".

Never paste the key into the app, a file in this folder, or a chat. If it leaks, delete it in the Google console and make a new one.

## What the messages mean

- "Google rejected the key. Check that the Routes API is enabled for it and that billing is on." The key is wrong, the Routes API is off for it, or billing is off.
- "Google says the quota is used up for now." Wait and try again later.
- "Google could not find one of the addresses." Write the address in full, with the city.
- "Google found no route for that mode." For example no bus data in that area. Pick another mode or type the time.
- "I could not reach Google." You are offline. The typed time is used.
- "This month's 5000 lookups are used up." The cap of this app. The typed time is used until next month.

When anything fails, your typed time is used and nothing breaks. A lookup that failed is not tried again for a day (two weeks for "no route" or an unknown address), unless you change the addresses or the mode, or press Refresh now.
