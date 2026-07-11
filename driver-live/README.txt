FleetProtect365 Live Driver v0.4

1. Open config.js.
2. Paste your Supabase Project URL.
3. Paste your browser-safe publishable key.
4. Never paste a service-role or secret key.
5. Upload the entire folder to GitHub under: driver-live

Expected URL:
https://sg1strgt.github.io/FleetProtect365/driver-live/

Working now:
- Supabase login
- Persistent session
- Live employee profile
- Live Wade Freight truck list
- GPS capture
- Save inspection draft to Supabase
- View signed-in user's entries
- Logout

Pilot login currently uses Supabase email/password.
Employee-ID login will be added with a secure server-side resolver.
