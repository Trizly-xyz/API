# Cloudflare Worker Setup for api.trizly.xyz

## The Problem
- Your hub runs on port 20942
- Direct IP works: http://65.21.16.214:20942/
- Domain doesn't: api.trizly.xyz (because Cloudflare doesn't proxy port 20942)
- You can't change the port or use Nginx

## The Solution
Deploy the Cloudflare Worker to proxy api.trizly.xyz to your hub on port 20942.

## Steps (In Cloudflare Dashboard)

1. **Go to Workers & Pages**
   - Log into Cloudflare dashboard
   - Click "Workers & Pages" in left sidebar

2. **Create Worker**
   - Click "Create application"
   - Click "Create Worker"
   - Name it: `api-trizly-proxy`
   - Click "Deploy"

3. **Edit the Worker Code**
   - Click "Edit code"
   - Delete all existing code
   - Copy and paste the entire contents of `cloudflare-worker.js`
   - Click "Save and Deploy"

4. **Add Custom Domain**
   - Go back to the worker overview
   - Click "Triggers" tab
   - Under "Custom Domains", click "Add Custom Domain"
   - Enter: `api.trizly.xyz`
   - Click "Add Custom Domain"

5. **Done!**
   - Wait 1-2 minutes for DNS propagation
   - Test: https://api.trizly.xyz/health
   - Test: https://api.trizly.xyz/lumi/health

## What This Does
- All requests to `api.trizly.xyz` go through Cloudflare Worker
- Worker forwards them to `http://65.21.16.214:20942`
- Your hub receives the requests and responds
- Worker returns the response to the client

## No Code Changes Needed
Your hub stays on port 20942. The worker handles everything.
