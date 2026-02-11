const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const { ISSUE_STATUS, ISSUE_SEVERITY, COLORS } = require('../utils/constants');

function getStatusMeta(status) {
  const normalized = (status || ISSUE_STATUS.OPEN).toLowerCase();
  switch (normalized) {
    case ISSUE_STATUS.BUG:
      return { label: 'Bug', color: COLORS.ORANGE };
    case ISSUE_STATUS.SOLVED:
    case 'closed':
    case 'resolved':
      return { label: 'Solved', color: COLORS.GREEN };
    default:
      return { label: 'Open', color: COLORS.YELLOW };
  }
}

function getSeverityLabel(severity) {
  const s = (severity || ISSUE_SEVERITY.NORMAL).toLowerCase();
  if (s === ISSUE_SEVERITY.LOW) return 'Low';
  if (s === ISSUE_SEVERITY.HIGH) return 'High';
  if (s === ISSUE_SEVERITY.CRITICAL) return 'Critical';
  return 'Normal';
}

function issueActionRow(issueId, status, messageId) {
  const isBug = (status || '').toLowerCase() === ISSUE_STATUS.BUG;
  const isSolved = (status || '').toLowerCase() === ISSUE_STATUS.SOLVED;
  const isOpen = !isBug && !isSolved;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`issue_bug_${issueId}${messageId ? '_' + messageId : ''}`)
      .setLabel('Mark Bug')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isBug),
    new ButtonBuilder()
      .setCustomId(`issue_solved_${issueId}${messageId ? '_' + messageId : ''}`)
      .setLabel('Mark Solved')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isSolved),
    new ButtonBuilder()
      .setCustomId(`issue_reopen_${issueId}${messageId ? '_' + messageId : ''}`)
      .setLabel('Reopen')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isOpen),
    new ButtonBuilder()
      .setCustomId(`issue_details_${issueId}${messageId ? '_' + messageId : ''}`)
      .setLabel('Add Details')
      .setStyle(ButtonStyle.Primary)
  );
}

function createIssueDetailsModal(issueId, messageId, existingDetails) {
  const modal = new ModalBuilder()
    .setCustomId(`issue_details_${issueId}${messageId ? '_' + messageId : ''}`)
    .setTitle(existingDetails ? 'Edit Issue Details' : 'Provide Issue Details');

  const d = existingDetails || {};

  const steps = new TextInputBuilder()
    .setCustomId('steps')
    .setLabel('Steps to Reproduce')
    .setPlaceholder('1) ... 2) ... 3) ...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);
  if (d.steps) steps.setValue(d.steps);

  const expected = new TextInputBuilder()
    .setCustomId('expected')
    .setLabel('Expected Behavior')
    .setPlaceholder('What should happen?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);
  if (d.expected) expected.setValue(d.expected);

  const actual = new TextInputBuilder()
    .setCustomId('actual')
    .setLabel('Actual Behavior')
    .setPlaceholder('What happened instead?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);
  if (d.actual) actual.setValue(d.actual);

  const extra = new TextInputBuilder()
    .setCustomId('extra')
    .setLabel('Additional Context (optional)')
    .setPlaceholder('Logs, environment, screenshots...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);
  if (d.extra) extra.setValue(d.extra);

  modal.addComponents(
    new ActionRowBuilder().addComponents(steps),
    new ActionRowBuilder().addComponents(expected),
    new ActionRowBuilder().addComponents(actual),
    new ActionRowBuilder().addComponents(extra)
  );
  return modal;
}

function buildIssueEmbed(issue, reporterUser) {
  const statusMeta = getStatusMeta(issue.status);
  const severity = getSeverityLabel(issue.severity);
  const embed = new EmbedBuilder()
    .setTitle(issue.title)
    .setDescription(issue.description || 'No description provided')
    .setColor(statusMeta.color)
    .addFields(
      { name: 'Severity', value: `${severity}`, inline: true },
      { name: 'Reporter', value: reporterUser ? `<@${reporterUser.id}>` : (issue.reporter_id ? `<@${issue.reporter_id}>` : 'Unknown'), inline: true }
    )
    .setFooter({ text: `Issue ID: ${issue.id}` })
    .setTimestamp(issue.updated_at ? new Date(issue.updated_at) : new Date());

  // Add details if present
  if (issue.details) {
    try {
      const d = typeof issue.details === 'string' ? JSON.parse(issue.details) : issue.details;
      if (d.steps) embed.addFields({ name: 'Steps to Reproduce', value: d.steps.substring(0, 1024) });
      if (d.expected) embed.addFields({ name: 'Expected Behavior', value: d.expected.substring(0, 1024) });
      if (d.actual) embed.addFields({ name: 'Actual Behavior', value: d.actual.substring(0, 1024) });
      if (d.extra) embed.addFields({ name: 'Additional Context', value: d.extra.substring(0, 1024) });
    } catch (_) {
      // ignore
    }
  }

  return embed;
}

function buildDetailsEmbed(issue, detailsObj, user) {
  const d = detailsObj || {};
  const embed = new EmbedBuilder()
    .setTitle(`Details: ${issue.title}`)
    .setColor(COLORS.BLUE)
    .setFooter({ text: `Issue ID: ${issue.id}` })
    .setTimestamp();

  if (user) {
    embed.setAuthor({ name: `Updated by ${user.username}`, iconURL: user.displayAvatarURL?.() });
  }

  if (d.steps) embed.addFields({ name: 'Steps to Reproduce', value: d.steps.substring(0, 1024) });
  if (d.expected) embed.addFields({ name: 'Expected Behavior', value: d.expected.substring(0, 1024) });
  if (d.actual) embed.addFields({ name: 'Actual Behavior', value: d.actual.substring(0, 1024) });
  if (d.extra) embed.addFields({ name: 'Additional Context', value: d.extra.substring(0, 1024) });

  if (!d.steps && !d.expected && !d.actual && !d.extra) {
    embed.setDescription('No details provided yet.');
  }

  return embed;
}

module.exports = {
  issueActionRow,
  createIssueDetailsModal,
  buildIssueEmbed,
  buildDetailsEmbed,
  getStatusMeta,
  getSeverityLabel
};


