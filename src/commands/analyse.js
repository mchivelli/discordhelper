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

            // Create simple, focused embeds
            const embeds = [];

            // Main summary embed
            const mainEmbed = new EmbedBuilder()
                .setTitle(`Analysis: ${analysisScope}`)
                .setDescription(analysis.actuallyDiscussed || 'No clear discussion summary available.')
                .setColor(0x2ECC71)
                .setTimestamp()
                .setFooter({ 
                    text: `${messages.length} messages analyzed from last ${daysToAnalyze} days`
                });

            embeds.push(mainEmbed);

            // User concerns embed - the most important part
            if (analysis.userConcerns && analysis.userConcerns.length > 0) {
                const concernsEmbed = new EmbedBuilder()
                    .setTitle('What Users Actually Said')
                    .setColor(0x3498DB);

                const concernsText = analysis.userConcerns
                    .map((concern, i) => `**${concern.user}**: "${concern.said}"\n> Wants: ${concern.wants}`)
                    .join('\n\n');

                concernsEmbed.setDescription(concernsText.substring(0, 4096));
                embeds.push(concernsEmbed);
            }

            // Agreements/decisions (if any)
            if (analysis.agreements && analysis.agreements.length > 0) {
                const agreementsEmbed = new EmbedBuilder()
                    .setTitle('Decisions Made')
                    .setColor(0x27AE60);

                const agreementsText = analysis.agreements
                    .map((agreement, i) => `${i + 1}. ${agreement}`)
                    .join('\n');

                agreementsEmbed.setDescription(agreementsText.substring(0, 4096));
                embeds.push(agreementsEmbed);
            }

            // Action items (only if users actually requested them)
            if (analysis.actionableItems && analysis.actionableItems.length > 0) {
                const actionsEmbed = new EmbedBuilder()
                    .setTitle('What Users Want You To Do')
                    .setColor(0xE74C3C);

                const actionsText = analysis.actionableItems
                    .map((item, i) => `**${i + 1}.** ${item.task}\nRequested by: ${item.requestedBy} (${item.urgency} priority)`)
                    .join('\n\n');

                actionsEmbed.setDescription(actionsText.substring(0, 4096));
                embeds.push(actionsEmbed);
            }

            // Next steps (if mentioned)
            if (analysis.nextStepsFromChat && analysis.nextStepsFromChat.length > 0) {
                const nextEmbed = new EmbedBuilder()
                    .setTitle('Next Steps Suggested')
                    .setColor(0x9B59B6);

                const nextText = analysis.nextStepsFromChat
                    .map((step, i) => `${i + 1}. ${step}`)
                    .join('\n');

                nextEmbed.setDescription(nextText.substring(0, 4096));
                embeds.push(nextEmbed);
            }

            // Technical mentions (only if actually discussed)
            if (detailed && analysis.technicalMentions && analysis.technicalMentions.length > 0) {
                const techEmbed = new EmbedBuilder()
                    .setTitle('Technical Details Mentioned')
                    .setColor(0x95A5A6);

                const techText = analysis.technicalMentions
                    .map((mention, i) => `${i + 1}. ${mention}`)
                    .join('\n');

                techEmbed.setDescription(techText.substring(0, 4096));
                embeds.push(techEmbed);
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
