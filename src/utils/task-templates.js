/**
 * Discord-optimized task templates for quick task creation
 * These templates provide pre-defined stages for common Discord server task types
 * Each stage includes emojis for better visual representation
 */

const templates = {
  // Web development project template
  "web": {
    name: "Discord Web Integration",
    stages: [
      { name: "📋 Planning", description: "Define requirements for Discord integration and plan architecture. Gather community input on features." },
      { name: "🎨 Design", description: "Create mockups of bot interfaces and web elements that will connect with Discord." },
      { name: "⚙️ Development", description: "Implement Discord API connections and web functionality. Set up webhooks and authentication." },
      { name: "🧪 Testing", description: "Test bot commands, web features, and invite community members for beta testing." },
      { name: "🚀 Deployment", description: "Deploy to production, add bot to specified servers, and create documentation for users." }
    ]
  },
  
  // Discord meeting template
  "meeting": {
    name: "Discord Server Meeting",
    stages: [
      { name: "📝 Agenda Setting", description: "Define meeting goals and create a detailed agenda. Pin it in the appropriate channel." },
      { name: "🔧 Setup", description: "Configure voice channels, roles, and permissions. Prepare screen sharing if needed." },
      { name: "📨 Invitations", description: "Send Discord notifications, role pings, or DMs to all participants with relevant information." },
      { name: "🎙️ Facilitation", description: "Host the voice/video meeting and moderate the discussion to keep it on track." },
      { name: "✅ Follow-up", description: "Post meeting summary in server channel and assign action items via bot commands." }
    ]
  },
  
  // Discord content creation template
  "content": {
    name: "Server Content Creation",
    stages: [
      { name: "🔍 Research", description: "Gather information and poll community members for input on desired content." },
      { name: "📑 Outline", description: "Create a structured outline and share in a feedback channel for initial input." },
      { name: "📝 Draft", description: "Create the content draft with proper Discord formatting, emojis, and embeds." },
      { name: "👀 Review", description: "Have moderators review the content and gather feedback from trusted members." },
      { name: "📢 Publish", description: "Post finalized content to appropriate Discord channels with proper role pings." }
    ]
  },
  
  // Discord bot bug fixing template
  "bugfix": {
    name: "Bot Bug Fixing",
    stages: [
      { name: "🐛 Reproduction", description: "Verify the Discord bot issue and document the commands/actions that trigger it." },
      { name: "🔍 Analysis", description: "Check bot logs and code to determine what's causing the problem." },
      { name: "🔧 Implementation", description: "Write and implement the necessary fixes to resolve the Discord bot issue." },
      { name: "🧪 Testing", description: "Test commands in a private test channel to ensure the bug is resolved." },
      { name: "🚀 Deployment", description: "Update the bot on all servers and notify users about the fix in update channels." }
    ]
  },
  
  // Discord event planning template
  "event": {
    name: "Server Event Planning",
    stages: [
      { name: "🗓️ Initial Planning", description: "Define event concept, create Discord event, and set a schedule." },
      { name: "⚙️ Setup", description: "Configure event channels, create necessary roles, and set up any bots/integrations needed." },
      { name: "📣 Promotion", description: "Announce in server channels, create event embeds, and encourage members to RSVP." },
      { name: "🎮 Execution", description: "Host the event, moderate chat, and ensure smooth running of activities." },
      { name: "📊 Follow-up", description: "Thank participants, share highlights/screenshots, and collect feedback via reactions or forms." }
    ]
  },
  
  // Server moderation template
  "moderation": {
    name: "Discord Moderation",
    stages: [
      { name: "📋 Policy Review", description: "Review current server rules and moderation policies for gaps or improvements." },
      { name: "⚙️ Setup Tools", description: "Configure moderation bots, auto-moderation settings, and verification systems." },
      { name: "👥 Team Briefing", description: "Train moderators on policies and procedures with clear guidelines." },
      { name: "🛡️ Implementation", description: "Roll out new moderation practices and communicate changes to the community." },
      { name: "📊 Monitoring", description: "Track effectiveness through mod logs and gather feedback for continuous improvement." }
    ]
  }
};

/**
 * Get a list of available templates
 * @returns {Array} Array of template objects with id and name
 */
function getTemplateList() {
  return Object.entries(templates).map(([id, template]) => ({
    id,
    name: template.name
  }));
}

/**
 * Get a specific template by ID
 * @param {string} templateId - ID of the template to retrieve
 * @returns {Object|null} Template object if found, null otherwise
 */
function getTemplate(templateId) {
  return templates[templateId.toLowerCase()] || null;
}

/**
 * Get stage information for a template
 * @param {string} templateId - ID of the template to retrieve stages for
 * @returns {Array|null} Array of stage objects if template found, null otherwise
 */
function getTemplateStages(templateId) {
  const template = getTemplate(templateId);
  return template ? template.stages : null;
}

module.exports = {
  getTemplateList,
  getTemplate,
  getTemplateStages
};
