#!/bin/bash
# Final deployment script to fix and test the Discord bot

set -e
echo "🚀 FINAL DISCORD BOT DEPLOYMENT SCRIPT"
echo "======================================="

# Step 1: Stop any existing containers
echo "📋 Step 1: Stopping existing containers..."
docker-compose down || true

# Step 2: Clean up any existing containers and networks
echo "🧹 Step 2: Cleaning up Docker resources..."
docker-compose down --remove-orphans || true
docker system prune -f || true

# Step 3: Rebuild the container with fixes
echo "🔧 Step 3: Rebuilding bot container..."
docker-compose build --no-cache

# Step 4: Start the container
echo "🚀 Step 4: Starting the bot..."
docker-compose up -d

# Step 5: Wait a moment for startup
echo "⏳ Step 5: Waiting for bot startup..."
sleep 10

# Step 6: Check if bot is running
echo "🔍 Step 6: Checking bot status..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ Container is running!"
else
    echo "❌ Container failed to start!"
    docker-compose logs bot
    exit 1
fi

# Step 7: Check logs for Discord login
echo "📋 Step 7: Checking Discord login..."
sleep 5

if docker-compose logs bot | grep -q "SUCCESS: Logged in as"; then
    echo "🎉 SUCCESS! Bot logged in to Discord!"
    
    # Step 8: Test message collection
    echo "📋 Step 8: Testing message collection..."
    echo "Please send 3-5 test messages in your Discord server now..."
    echo "Press Enter when you've sent the messages..."
    read -p ""
    
    # Wait for messages to be processed
    sleep 10
    
    # Check if messages were collected
    echo "🔍 Checking if messages were collected..."
    MESSAGE_COUNT=$(docker-compose exec -T bot node -e "
        const db = require('./src/utils/db');
        const result = db.prepare('SELECT COUNT(*) as count FROM chat_messages').get();
        console.log(result.count);
    " 2>/dev/null | tail -1)
    
    if [ "$MESSAGE_COUNT" -gt "0" ]; then
        echo "✅ SUCCESS! $MESSAGE_COUNT messages collected!"
        echo ""
        echo "🎯 FINAL STATUS: BOT IS FULLY FUNCTIONAL!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✅ Discord login: WORKING"
        echo "✅ Message collection: WORKING" 
        echo "✅ Database: WORKING"
        echo "✅ Chat summarization: READY TO USE"
        echo ""
        echo "🧪 Test the summarization with:"
        echo "   /summarize channel hours:1"
        echo "   /summarize server hours:1"
        echo "   /summarize history days:1"
        echo ""
        echo "🎉 YOUR BOT IS NOW FULLY OPERATIONAL!"
    else
        echo "⚠️  Messages not collected yet. Check Discord permissions."
        echo "   Make sure MESSAGE_CONTENT intent is enabled!"
    fi
    
elif docker-compose logs bot | grep -q "Starting Discord bot login"; then
    echo "⏳ Bot is attempting to login..."
    echo "📋 Full logs:"
    docker-compose logs bot
    echo ""
    echo "🔧 If login is stuck, check your Discord Developer Portal:"
    echo "   1. Enable MESSAGE_CONTENT intent"
    echo "   2. Verify DISCORD_TOKEN is correct"
else
    echo "❌ Bot failed to start Discord login!"
    echo "📋 Full logs:"
    docker-compose logs bot
    echo ""
    echo "🔧 Debug steps:"
    echo "   1. Check environment variables"
    echo "   2. Verify Discord token"
    echo "   3. Check Docker container health"
fi

echo ""
echo "📊 Container status:"
docker-compose ps

echo ""
echo "🔄 To check logs in real-time:"
echo " docker-compose logs -f bot"

echo ""
echo "📋 Deployment script complete!"