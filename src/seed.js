// The iCloud connection details the app starts with.
// In this repository it is EMPTY on purpose. The TestFlight build pipeline writes the real values into this file just
// before it builds (from a private repository secret), so an installed app works immediately — even on a Wi-Fi that only
// allows Apple, and with nothing for the user to enter. Over-the-air updates are built from the repository as it is, so
// they never contain it: an installed app keeps the copy it stored on first launch (and refreshes it from the bot).
export const SEED = '';
