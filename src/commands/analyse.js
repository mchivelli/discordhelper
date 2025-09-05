const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { analyzeChannelMessages, getChannelMessages } = require('../utils/ai.js');
const logger = require('../utils/logger.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analyse')
        .setDescription('Analyze chat history and generate developer-focused insights')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Analyze a specific channel\'s chat history')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to analyze')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Number of days of history to analyze (default: 7, max: 30)')
                        .setMinValue(1)
                        .setMaxValue(30)
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('detailed')
                        .setDescription('Include detailed technical analysis and code snippets')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('current')
                .setDescription('Analyze the current channel\'s recent history')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Number of days of history to analyze (default: 7, max: 30)')
                        .setMinValue(1)
                        .setMaxValue(30)
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('detailed')
                        .setDescription('Include detailed technical analysis and code snippets')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('Analyze entire server\'s recent chat history')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Number of days of history to analyze (default: 3, max: 14)')
                        .setMinValue(1)
                        .setMaxValue(14)
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('detailed')
                        .setDescription('Include detailed technical analysis and code snippets')
                        .setRequired(false))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const days = interaction.options.getInteger('days');
        const detailed = interaction.options.getBoolean('detailed') || false;

        // Admin-only check (redundant with setDefaultMemberPermissions, but explicit)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ This command requires administrator permissions.',
                ephemeral: true
            });
        }

        // Defer reply as analysis may take time
        await interaction.deferReply();

        try {
            let channelId, guildId, analysisScope, defaultDays;
            
            switch (subcommand) {
                case 'channel':
                    const targetChannel = interaction.options.getChannel('channel');
                    if (!targetChannel.isTextBased()) {
                        return interaction.editReply('❌ Please select a text channel for analysis.');
                    }
                    channelId = targetChannel.id;
                    guildId = interaction.guildId;
                    analysisScope = `#${targetChannel.name}`;
                    defaultDays = 7;
                    break;
                
                case 'current':
                    channelId = interaction.channelId;
                    guildId = interaction.guildId;
                    analysisScope = `#${interaction.channel.name}`;
                    defaultDays = 7;
                    break;
                
                case 'server':
                    channelId = null; // Analyze all channels
                    guildId = interaction.guildId;
                    analysisScope = `${interaction.guild.name} (Server-wide)`;
                    defaultDays = 3;
                    break;
            }

            const daysToAnalyze = days || defaultDays;
            const startTime = Date.now() - (daysToAnalyze * 24 * 60 * 60 * 1000);

            // Update status
            await interaction.editReply({
                content: `🔍 Analyzing ${analysisScope} (last ${daysToAnalyze} days)...\nThis may take a moment.`
            });

            // Get messages from database with Discord fallback
            console.log(`[ANALYSE] Starting message retrieval for ${analysisScope}`);
            console.log(`[ANALYSE] Channel ID: ${channelId}, Guild ID: ${guildId}`);
            console.log(`[ANALYSE] Time range: ${new Date(startTime).toISOString()} to now`);
            
            const discordChannel = channelId ? interaction.guild.channels.cache.get(channelId) : null;
            console.log(`[ANALYSE] Discord channel lookup: ${channelId} -> ${discordChannel ? discordChannel.name : 'null'}`);
            
            const messages = await getChannelMessages(guildId, channelId, startTime, discordChannel);

            console.log(`[ANALYSE] Retrieved ${messages.length} messages for analysis from ${analysisScope}`);

            if (!messages || messages.length === 0) {
                let errorMessage = `❌ No messages found in ${analysisScope} for the last ${daysToAnalyze} days.\n\n`;
                
                if (!discordChannel) {
                    errorMessage += `🚫 **Issue:** Cannot access channel object for Discord fallback.\n`;
                } else {
                    errorMessage += `🔍 **Checked:** Database and Discord API fallback.\n`;
                }
                
                errorMessage += `💡 **Try:**\n`;
                errorMessage += `• Use a shorter time period (1-2 days)\n`;
                errorMessage += `• Ensure bot has "Read Message History" permission\n`;
                errorMessage += `• Check bot logs for detailed error messages\n`;
                errorMessage += `• Verify there are actually messages in this channel`;
                
                return interaction.editReply({ content: errorMessage });
            }

            logger.info(`Analyzing ${messages.length} messages from ${analysisScope} (${new Date(startTime).toISOString()} to now)`);

            // Perform AI analysis
            const analysis = await analyzeChannelMessages(messages, {
                scope: analysisScope,
                detailed: detailed,
                days: daysToAnalyze,
                guildName: interaction.guild.name,
                channelName: channelId ? interaction.guild.channels.cache.get(channelId)?.name : 'Multiple Channels'
            });

            if (!analysis || analysis.error) {
                return interaction.editReply({
                    content: `❌ Failed to generate analysis: ${analysis?.error || 'Unknown error'}`
                });
            }

            // Create embeds for the analysis
            const embeds = [];

            // Main analysis embed
            const mainEmbed = new EmbedBuilder()
                .setTitle(`📊 Chat Analysis: ${analysisScope}`)
                .setDescription(analysis.summary || 'Analysis completed.')
                .setColor(0x00AE86)
                .setTimestamp()
                .setFooter({ 
                    text: `Analyzed ${messages.length} messages from the last ${daysToAnalyze} days`
                });

            // Add key insights
            if (analysis.keyTopics && analysis.keyTopics.length > 0) {
                mainEmbed.addFields({
                    name: '🎯 Key Topics Discussed',
                    value: analysis.keyTopics.map((topic, i) => `${i + 1}. ${topic}`).join('\n').substring(0, 1024),
                    inline: false
                });
            }

            if (analysis.decisions && analysis.decisions.length > 0) {
                mainEmbed.addFields({
                    name: '✅ Decisions & Consensus',
                    value: analysis.decisions.map((decision, i) => `${i + 1}. ${decision}`).join('\n').substring(0, 1024),
                    inline: false
                });
            }

            embeds.push(mainEmbed);

            // Developer action items embed
            if (analysis.actionItems && analysis.actionItems.length > 0) {
                const actionEmbed = new EmbedBuilder()
                    .setTitle('🛠️ Developer Action Items')
                    .setDescription('Prioritized implementation tasks based on the discussion:')
                    .setColor(0x3498DB);

                const actionItemsText = analysis.actionItems
                    .map((item, i) => `**${i + 1}.** ${item.task}\n   📌 Priority: ${item.priority || 'Normal'}\n   💡 *${item.reason || 'Derived from discussion'}*`)
                    .join('\n\n');

                actionEmbed.addFields({
                    name: 'Implementation Tasks',
                    value: actionItemsText.substring(0, 4096),
                    inline: false
                });

                embeds.push(actionEmbed);
            }

            // Technical insights embed (if detailed mode)
            if (detailed && analysis.technicalInsights) {
                const techEmbed = new EmbedBuilder()
                    .setTitle('🔧 Technical Analysis')
                    .setColor(0xE74C3C);

                if (analysis.technicalInsights.technologies) {
                    techEmbed.addFields({
                        name: '💻 Technologies Mentioned',
                        value: analysis.technicalInsights.technologies.join(', ').substring(0, 1024),
                        inline: false
                    });
                }

                if (analysis.technicalInsights.patterns) {
                    techEmbed.addFields({
                        name: '📐 Design Patterns & Architecture',
                        value: analysis.technicalInsights.patterns.join('\n').substring(0, 1024),
                        inline: false
                    });
                }

                if (analysis.technicalInsights.suggestions) {
                    techEmbed.addFields({
                        name: '💡 Technical Suggestions',
                        value: analysis.technicalInsights.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n').substring(0, 1024),
                        inline: false
                    });
                }

                embeds.push(techEmbed);
            }

            // Productivity insights embed
            if (analysis.productivityInsights) {
                const prodEmbed = new EmbedBuilder()
                    .setTitle('📈 Productivity Insights')
                    .setColor(0x2ECC71);

                if (analysis.productivityInsights.blockers) {
                    prodEmbed.addFields({
                        name: '🚧 Identified Blockers',
                        value: analysis.productivityInsights.blockers.join('\n').substring(0, 1024),
                        inline: false
                    });
                }

                if (analysis.productivityInsights.improvements) {
                    prodEmbed.addFields({
                        name: '⚡ Process Improvements',
                        value: analysis.productivityInsights.improvements.join('\n').substring(0, 1024),
                        inline: false
                    });
                }

                if (analysis.productivityInsights.nextSteps) {
                    prodEmbed.addFields({
                        name: '➡️ Recommended Next Steps',
                        value: analysis.productivityInsights.nextSteps.join('\n').substring(0, 1024),
                        inline: false
                    });
                }

                embeds.push(prodEmbed);
            }

            // Participant insights (if available)
            if (analysis.participantHighlights) {
                const participantEmbed = new EmbedBuilder()
                    .setTitle('👥 Participant Contributions')
                    .setDescription('Key contributors and their focus areas:')
                    .setColor(0x9B59B6);

                const participantText = Object.entries(analysis.participantHighlights)
                    .slice(0, 5) // Limit to top 5 contributors
                    .map(([user, contribution]) => `**${user}:** ${contribution}`)
                    .join('\n');

                participantEmbed.addFields({
                    name: 'Top Contributors',
                    value: participantText.substring(0, 1024),
                    inline: false
                });

                embeds.push(participantEmbed);
            }

            // Send the analysis
            await interaction.editReply({
                content: `✅ Analysis complete for ${analysisScope}`,
                embeds: embeds.slice(0, 10) // Discord limit
            });

            logger.info(`Analysis completed for ${analysisScope} - ${messages.length} messages analyzed`);

        } catch (error) {
            logger.error('Error in analyse command:', error);
            await interaction.editReply({
                content: `❌ An error occurred during analysis: ${error.message}`
            });
        }
    },
};
