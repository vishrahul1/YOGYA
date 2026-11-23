# Admin account provisioning

YOGYA does not create passwords in application SQL. Supabase Auth owns credentials.

1. Register the intended admin through the normal YOGYA registration screen.
2. Open `promote_existing_user_to_admin.sql`.
3. Replace every `REPLACE_WITH_ADMIN_EMAIL` value with the registered email.
4. Run the complete script in the Supabase SQL Editor.
5. Sign out and sign in again.

The script creates the public user row if needed, replaces the student role with the admin role, updates Supabase application metadata, and writes an append-only audit event. It fails without changes when the placeholder remains or the Auth user does not exist.

The backend operator alternative is:

```powershell
cd services/api
python scripts/grant_admin.py admin@example.com
```

Never store or paste an admin password in repository SQL.
