# Telegram Bot with Webhook

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure bot:**
   - Update `BOT_TOKEN` with your actual bot token
   - Update `CHANNEL_USERNAME` with your channel username (without @)
   - Update `WEBHOOK_URL` with your domain URL

3. **For local development:**
   - Install ngrok: `npm install -g ngrok`
   - Run ngrok: `ngrok http 3000`
   - Copy the ngrok URL and update `WEBHOOK_URL`
   - Uncomment the ngrok line and comment the domain line

4. **Run the bot:**
   ```bash
   npm start
   ```

## Webhook Configuration

The bot now uses webhook instead of polling:
- More reliable than polling
- Instant message processing
- Better for production

## Features

- Channel subscription check
- Main menu with web app buttons
- Share functionality
- Help command
- Express server for webhook

## Environment Variables

- `PORT`: Server port (default: 3000)

## Deployment

For production:
1. Deploy to a server with HTTPS
2. Update `WEBHOOK_URL` to your server URL
3. Ensure your server is accessible from the internet
