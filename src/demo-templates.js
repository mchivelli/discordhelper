// Task templates for Discord server task management
module.exports = {
  // Templates accessible via /task create template:<name>
  templates: {
    // General Discord templates
    web: {
      name: 'Discord Web Integration',
      stages: [
        { 
          name: '📋 Planning', 
          description: 'Determine requirements and feasibility of the web integration with Discord'
        },
        { 
          name: '🔗 API Setup', 
          description: 'Configure necessary API connections between web service and Discord'
        },
        { 
          name: '💻 Development', 
          description: 'Build the integration components and features'
        },
        { 
          name: '🧪 Testing', 
          description: 'Test the integration in a controlled environment'
        },
        { 
          name: '🚀 Deployment', 
          description: 'Release the web integration to Discord server members'
        }
      ]
    },
    meeting: {
      name: 'Discord Server Meeting',
      stages: [
        { 
          name: '📅 Scheduling', 
          description: 'Set date, time and agenda for the meeting'
        },
        { 
          name: '📢 Announcements', 
          description: 'Notify all relevant members about the upcoming meeting'
        },
        { 
          name: '📝 Preparation', 
          description: 'Prepare materials, slides, and talking points'
        },
        { 
          name: '🎤 Execution', 
          description: 'Host the meeting, take notes, and manage discussion'
        },
        { 
          name: '📋 Follow-up', 
          description: 'Share meeting notes and assign action items'
        }
      ]
    },
    content: {
      name: 'Server Content Creation',
      stages: [
        { 
          name: '🧠 Brainstorming', 
          description: 'Generate ideas for server content based on community interests'
        },
        { 
          name: '📝 Planning', 
          description: 'Outline the content and required resources'
        },
        { 
          name: '🎨 Creation', 
          description: 'Develop the content (graphics, text, events, etc.)'
        },
        { 
          name: '👀 Review', 
          description: 'Get feedback from team members before publishing'
        },
        { 
          name: '📢 Publishing', 
          description: 'Share the content with the Discord community'
        }
      ]
    },
    bugfix: {
      name: 'Bot Bug Fixing',
      stages: [
        { 
          name: '🐛 Reproduction', 
          description: 'Document steps to consistently reproduce the bug'
        },
        { 
          name: '🔍 Investigation', 
          description: 'Identify the root cause of the issue'
        },
        { 
          name: '🛠️ Fix Implementation', 
          description: 'Develop and implement the solution'
        },
        { 
          name: '🧪 Testing', 
          description: 'Verify the bug is fixed and no new issues introduced'
        },
        { 
          name: '🚀 Deployment', 
          description: 'Update the bot with the fix'
        }
      ]
    },
    event: {
      name: 'Server Event Planning',
      stages: [
        { 
          name: '💡 Concept', 
          description: 'Define the event theme, purpose, and target audience'
        },
        { 
          name: '📝 Planning', 
          description: 'Create detailed event plan with timeline and resources needed'
        },
        { 
          name: '📢 Promotion', 
          description: 'Announce and market the event to community members'
        },
        { 
          name: '🎭 Execution', 
          description: 'Run the event, manage participant engagement'
        },
        { 
          name: '📊 Follow-up', 
          description: 'Gather feedback and recognize participants'
        }
      ]
    },
    moderation: {
      name: 'Discord Moderation',
      stages: [
        { 
          name: '📜 Policy Review', 
          description: 'Review and update server rules and moderation policies'
        },
        { 
          name: '👮 Team Organization', 
          description: 'Assign responsibilities to moderation team members'
        },
        { 
          name: '🛠️ Tool Setup', 
          description: 'Configure moderation bots and tools'
        },
        { 
          name: '📊 Implementation', 
          description: 'Apply new moderation procedures and train team'
        },
        { 
          name: '🔍 Monitoring', 
          description: 'Evaluate effectiveness and adjust as needed'
        }
      ]
    },
    
    // War SMP Server specific templates
    warEvent: {
      name: 'War SMP Battle Event',
      stages: [
        { 
          name: '⚔️ Battle Planning', 
          description: 'Design the battle scenario, rules, and rewards'
        },
        { 
          name: '🏗️ Map Preparation', 
          description: 'Build or modify battle arena and prepare necessary resources'
        },
        { 
          name: '📢 Faction Briefing', 
          description: 'Inform faction leaders about event details and ensure balanced participation'
        },
        { 
          name: '🎭 Event Execution', 
          description: 'Run the battle event, moderate gameplay, and ensure fair play'
        },
        { 
          name: '🏆 Aftermath', 
          description: 'Award prizes, update faction standings, and document outcomes'
        }
      ]
    },
    factionManagement: {
      name: 'Faction Management',
      stages: [
        { 
          name: '📋 Roster Review', 
          description: 'Update faction membership list and roles'
        },
        { 
          name: '🔄 Role Assignments', 
          description: 'Assign or update member responsibilities within the faction'
        },
        { 
          name: '📢 Communication', 
          description: 'Establish or improve faction communication channels'
        },
        { 
          name: '🏆 Goal Setting', 
          description: 'Define faction objectives and strategies'
        },
        { 
          name: '📊 Performance Review', 
          description: 'Evaluate faction progress and member contributions'
        }
      ]
    },
    buildProject: {
      name: 'War SMP Build Project',
      stages: [
        { 
          name: '🎨 Design', 
          description: 'Create plans and mockups for the building project'
        },
        { 
          name: '🗺️ Location Scouting', 
          description: 'Find and secure suitable location for the project'
        },
        { 
          name: '📦 Resource Gathering', 
          description: 'Collect all necessary building materials'
        },
        { 
          name: '🏗️ Construction', 
          description: 'Execute the build according to plans'
        },
        { 
          name: '✨ Finishing Touches', 
          description: 'Add details, decorations, and ensure functionality'
        }
      ]
    },
    serverUpdate: {
      name: 'War SMP Server Update',
      stages: [
        { 
          name: '📝 Update Planning', 
          description: 'Document changes, additions, and fixes for the update'
        },
        { 
          name: '📢 Community Input', 
          description: 'Gather feedback from players on proposed changes'
        },
        { 
          name: '🛠️ Implementation', 
          description: 'Apply changes to test environment and resolve issues'
        },
        { 
          name: '🧪 Testing', 
          description: 'Verify update functionality with select players'
        },
        { 
          name: '🚀 Deployment', 
          description: 'Roll out changes to production server and notify community'
        }
      ]
    },
    allianceFormation: {
      name: 'War SMP Alliance Formation',
      stages: [
        { 
          name: '🤝 Negotiation', 
          description: 'Discuss and agree on alliance terms between factions'
        },
        { 
          name: '📜 Treaty Creation', 
          description: 'Draft formal alliance agreement with specific terms'
        },
        { 
          name: '✍️ Signing Ceremony', 
          description: 'Host formal treaty signing with faction representatives'
        },
        { 
          name: '📢 Announcement', 
          description: 'Publicize alliance to server community'
        },
        { 
          name: '🔄 Integration', 
          description: 'Begin joint operations and resource sharing between allied factions'
        }
      ]
    }
  },
  
  // Faction roles for the War SMP Server
  factionRoles: [
    "Leader",
    "Co-Leader",
    "General",
    "Captain",
    "Diplomat",
    "Recruiter",
    "Scout",
    "Warrior",
    "Builder",
    "Farmer",
    "Miner",
    "Enchanter",
    "Brewer",
    "Scribe",
    "Spy"
  ],
  
  // Available factions in the War SMP
  factions: [
    "Red Kingdom",
    "Blue Alliance",
    "Green Tribe",
    "Yellow Empire",
    "Purple Dominion",
    "Black Order",
    "White Sanctuary",
    "Orange Federation"
  ]
}
