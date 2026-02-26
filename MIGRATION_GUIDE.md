# Migration from Supabase to Self-Hosted Storage

Large migration completed! You've successfully removed all Supabase dependencies and migrated to a **100% self-hosted solution** that works on Netlify's free plan.

## What Changed

### ✅ Authentication
- **Old**: Supabase Auth (email verification, cloud-based)
- **New**: Client-side JWT authentication (`customAuth.ts`)
  - Password-based sign up/sign in
  - Tokens stored in localStorage
  - No external dependencies needed
  - 24-hour session duration

### ✅ Database
- **Old**: Supabase PostgreSQL (conversations, messages, folders, config)
- **New**: Browser IndexedDB (`indexedDB.ts` + `localStorageService.ts`)
  - All data stored locally on device
  - Automatic persistence
  - Full export/import support for backups

### ✅ Storage
- **Old**: Supabase Storage
- **New**: Base64 embedded in IndexedDB
  - Images encoded as base64 in conversation messages
  - No external image hosting needed

### ✅ Removed Dependencies
- `@supabase/supabase-js` removed from package.json

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           React Frontend App                │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────┐  ┌────────────────┐  │
│  │  Custom Auth     │  │   useConfig    │  │
│  │  (customAuth.ts) │  │   useChat      │  │
│  │                  │  │   useConv...   │  │
│  └────────┬─────────┘  └────────┬───────┘  │
│           │                     │          │
│           v                     v          │
│  ┌─────────────────────────────────────┐   │
│  │   IndexedDB Storage Layer           │   │
│  │  (indexedDB.ts)                     │   │
│  │                                     │   │
│  │  • conversations                    │   │
│  │  • messages                         │   │
│  │  • folders                          │   │
│  │  • user_config                      │   │
│  │  • user_api_keys (encrypted)        │   │
│  └─────────────────────────────────────┘   │
│           │                                │
│           v                                │
│  ┌──────────────────┐  ┌────────────────┐  │
│  │ Browser Storage  │  │  localStorage  │  │
│  │  (IndexedDB)     │  │  (sessions)    │  │
│  └──────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────┘
         Local Browser Only
    No external servers needed
```

## Key Files

### New Files
- `src/lib/customAuth.ts` - JWT-based authentication
- `src/lib/indexedDB.ts` - IndexedDB wrapper for data persistence
- `src/lib/localStorageService.ts` - Storage service (replaces supabaseService)

### Updated Files
- `src/hooks/useAuth.tsx` - Uses customAuth instead of Supabase
- `src/hooks/useConfig.ts` - Uses localStorageService for config
- `src/hooks/useConversations.ts` - Uses localStorageService
- `src/hooks/useFolders.ts` - Uses localStorageService
- `src/lib/searchService.ts` - Uses localStorageService
- `src/lib/exportImport.ts` - Uses localStorageService
- `package.json` - Removed @supabase/supabase-js
- `.env.example` - Simplified, no Supabase keys needed

## Setup for Netlify Free Plan

1. **No special setup needed!** Everything works in the browser.

2. **Environment Variables**: You don't need any environment variables for auth/storage.

3. **Optional**: If you want to use external LLM providers:
   ```
   VITE_OPENAI_API_KEY=your_key
   VITE_ANTHROPIC_API_KEY=your_key
   ```

4. **Build**: Standard Vite build works fine:
   ```bash
   npm install
   npm run build
   ```

5. **Deploy**: Deploy to Netlify as usual - no backend required!

## Data Persistence

### How It Works
- All conversations, messages, folders, and config are stored in browser IndexedDB
- Sessions stored in localStorage
- Each browser/device has its own separate data
- Data persists across browser sessions

### Export/Import for Backup
You can export all data from Settings and import it later:
- **Conversations**: JSON export includes all messages
- **Credentials**: User credentials can be exported separately
- **Restore**: Import JSON files to restore data on same or different browser

### Cross-Device Sync
Since data is per-browser, to sync across devices:
1. Export data from one device via Settings
2. Import on the other device

**Future Enhancement**: You could add optional cloud sync using a free service like Firebase, but it's not required.

## Important Notes

⚠️ **Client-Side Limitations**:
- Data only exists on the device where the user browses
- Clearing browser data will delete everything
- No automatic cloud backup
- Each browser has separate data

✅ **Advantages**:
- Zero server costs
- No account data sent to external servers
- Works offline (reads/writes continue to IndexedDB)
- Instant deployment on Netlify free tier
- Full encryption of API keys
- Complete user privacy

## Migration from Supabase

If you had existing Supabase data:

1. **Export from old app**: Use Settings → Export Data
2. **Clear browser storage** (optional cleanup)
3. **Deploy new version**
4. **Sign up with new account** (or use existing password)
5. **Import data** via Settings → Import Data

The auth credentials are stored locally, so you'll use your own password system.

## Testing

Verify everything works:
```bash
npm install
npm run dev
```

1. Create account (sign up)
2. Add a conversation
3. Reload page - data persists
4. Settings → Import/Export - test backup
5. Build for production - works on Netlify

## Troubleshooting

### "IndexedDB quota exceeded"
- IndexedDB typically has 50MB limit per origin
- For large image collections, consider compressing or using external image service

### Data not persisting
- Check if IndexedDB is enabled in browser
- Try in incognito mode to rule out browser extensions
- Check browser console for errors

### Cross-browser sync needed
- Use Export/Import feature from Settings
- Or add optional cloud sync layer later if needed

## Next Steps (Optional)

If you need additional features:

1. **Cloud Backup** (Optional):
   - Firebase free tier for encrypted backups
   - Or simple HTTP API on minimal server

2. **Collaborative Editing** (Optional):
   - Add WebSocket sync later
   - Not needed for solo use

3. **Better Password Security**:
   - Current: simple hash (client-side only)
   - Future: Add bcrypt library for stronger hashing

## Support

Your app is now:
- ✅ Free to host on Netlify
- ✅ No external database costs
- ✅ No auth service costs
- ✅ Complete user data privacy
- ✅ Works offline
- ✅ Fully self-contained

Enjoy your Supabase-free app! 🚀
