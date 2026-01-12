# Trizly API Hub

Multi-API hub for Trizly services, currently hosting the Lumi verification API.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   - Copy `.env.example` to `.env` if needed
   - The `.env` file is already configured from the main Lumi project
   - Key environment variables:
     - `MONGO_URI`: MongoDB connection string
     - `API_PORT`: Port for API server (default: 3000)
     - `VERIFY_WEBHOOK_SECRET`: Secret for webhook authentication
     - `DOMAIN`: Main domain (https://trizly.xyz)
     - `PUBLIC_API_BASE`: API base URL (https://api.trizly.xyz)

3. **Start the Server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

## API Structure

The API hub hosts multiple service APIs under a unified endpoint structure:

### Lumi API Routes

Base: `/lumi/`

**Verification Endpoints:**
- `POST /lumi/verify/callback` - Discord OAuth callback
- `POST /lumi/verify/complete` - Webhook for verification completion (used by workers)
- `POST /lumi/unlink/complete` - Webhook for account unlinking

**Lookup Endpoints:**
- `GET /lumi/lookup/discord/:discordId` - Look up verification by Discord ID
- `GET /lumi/lookup/roblox/:identifier` - Look up verification by Roblox ID or username

## Integration Points

### 1. Cloudflare Workers
The verification flow uses Cloudflare Workers to handle OAuth flows:
- Workers send webhooks to: `https://api.trizly.xyz/lumi/verify/complete`
- Workers send unlink requests to: `https://api.trizly.xyz/lumi/unlink/complete`

### 2. Lumi Discord Bot
- The Lumi bot listens for events from the API via EventBus
- Events: `userVerified`, `userUnlinked`
- Bot directs users to: `https://trizly.xyz/verify`

### 3. trizlySite
- Verification UI: `https://trizly.xyz/verify/`
- Success page: `https://trizly.xyz/verify/success`
- Unlink page: `https://trizly.xyz/unlink/`

## Key Differences from Lumi Folder

The API folder serves as a standalone API server, separate from the Lumi Discord bot:

1. **Route Prefixes**: Routes are prefixed with `/lumi/` to allow hosting multiple APIs
2. **No Discord Bot**: This is API-only; the bot runs in the Lumi folder
3. **Shared Database**: Uses the same MongoDB instance as Lumi
4. **EventBus**: Uses EventEmitter for internal communication (expandable for bot integration if needed)

## Port Configuration

- Default API port: 3000 (via `API_PORT` env variable)
- Lumi backend: Port 22028 (via `PORT` env variable)

Both services can run simultaneously on different ports.

## Security

- Webhooks require `X-Verify-Secret` header for authentication
- CORS configured for trizly.xyz domains
- Rate limiting on webhook endpoints
- Input validation for Discord IDs and Roblox data

## Database Models

- **VerifiedUser**: Stores Discord-Roblox verification mappings
- **VerificationSession**: Temporary session data during verification flow

## Troubleshooting

### Port Already in Use
```bash
# Check what's running on port 3000
lsof -i :3000
# Kill the process if needed
kill -9 <PID>
```

### Database Connection Issues
- Verify `MONGO_URI` in `.env`
- Ensure MongoDB cluster allows connections from your IP
- Check MongoDB credentials

### Webhook Authentication Failures
- Verify `VERIFY_WEBHOOK_SECRET` matches between:
  - API `.env`
  - Lumi `.env`
  - Cloudflare Worker environment variables

## Development

The API automatically reloads when files change if using `npm run dev` (nodemon).

## Production Deployment

Recommended hosting: Railway, Render, or similar Node.js hosting platforms

Environment variables must be set in production:
- All variables from `.env.example`
- `NODE_ENV=production`
- Database connection with proper authentication
