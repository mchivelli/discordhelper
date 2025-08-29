const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');

function getStatusMeta(status) {
  const normalized = (status || 'open').toLowerCase();
  switch (normalized) {
    case 'bug':
      return { label: 'Bug', emoji: '🐛', color: 0xe67e22 };
    case 'solved':
    case 'closed':
    case 'resolved':
      return { label: 'Solved', emoji: '✅', color: 0x2ecc71 };
    default:
      return { label: 'Open', emoji: '🟡', color: 0xf1c40f };
  }
}

function getSeverityLabel(severity) {
  const s = (severity || 'normal').toLowerCase();
  if (s === 'low') return 'Low';
  if (s === 'high') return 'High';
  if (s === 'critical') return 'Critical';
  return 'Normal';
}

function issueActionRow(issueId, status) {
  const isBug = (status || '').toLowerCase() === 'bug';
  const isSolved = (status || '').toLowerCase() === 'solved';
  const isOpen = !isBug && !isSolved;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`issue_bug_${issueId}`)
      .setLabel('Mark Bug')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isBug),
    new ButtonBuilder()
      .setCustomId(`issue_solved_${issueId}`)
      .setLabel('Mark Solved')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isSolved),
    new ButtonBuilder()
      .setCustomId(`issue_reopen_${issueId}`)
      .setLabel('Reopen')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isOpen),
    new ButtonBuilder()
      .setCustomId(`issue_details_${issueId}`)
      .setLabel('Add Details')
      .setStyle(ButtonStyle.Primary)
  );
}

function createIssueDetailsModal(issueId) {
  const modal = new ModalBuilder()
    .setCustomId(`issue_details_${issueId}`)
    .setTitle('Provide Issue Details');

  const steps = new TextInputBuilder()
    .setCustomId('steps')
    .setLabel('Steps to Reproduce')
    .setPlaceholder('1) ... 2) ... 3) ...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  const expected = new TextInputBuilder()
    .setCustomId('expected')
    .setLabel('Expected Behavior')
    .setPlaceholder('What should happen?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  const actual = new TextInputBuilder()
    .setCustomId('actual')
    .setLabel('Actual Behavior')
    .setPlaceholder('What happened instead?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  const extra = new TextInputBuilder()
    .setCustomId('extra')
    .setLabel('Additional Context (optional)')
    .setPlaceholder('Logs, environment, screenshots...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

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
    .setTitle(`${statusMeta.emoji} ${issue.title}`)
    .setDescription(issue.description || 'No description provided')
    .setColor(statusMeta.color)
    .addFields(
      { name: 'Status', value: `${statusMeta.label}`, inline: true },
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

  if (issue.thread_id) {
    embed.addFields({ name: 'Thread', value: `<#${issue.thread_id}>` });
  }

  return embed;
}

module.exports = {
  issueActionRow,
  createIssueDetailsModal,
  buildIssueEmbed,
  getStatusMeta,
  getSeverityLabel
};


