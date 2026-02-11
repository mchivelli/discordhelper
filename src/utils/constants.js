// Status constants for Admin Tasks and Issues
// Emojis are purposefully removed to keep the interface clean and testable

const TASK_STATUS = {
    UNASSIGNED: 'unassigned',
    IN_PROGRESS: 'in_progress',
    COMPLETE: 'complete'
};

const ISSUE_STATUS = {
    OPEN: 'open',
    BUG: 'bug',
    SOLVED: 'solved'
};

const ISSUE_SEVERITY = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    CRITICAL: 'critical'
};

// Colors for embeds
const COLORS = {
    GRAY: 0x808080,
    ORANGE: 0xFFA500,
    GREEN: 0x00FF00,
    YELLOW: 0xF1C40F,
    RED: 0xE74C3C,
    BLUE: 0x3498DB
};

// Display prefixes for threads/messages
const PREFIXES = {
    TASK: {
        UNASSIGNED: '[Unassigned]',
        IN_PROGRESS: '[In Progress]',
        COMPLETE: '[Complete]'
    },
    ISSUE: {
        OPEN: '[Open]',
        BUG: '[Bug]',
        SOLVED: '[Solved]'
    }
};

module.exports = {
    TASK_STATUS,
    ISSUE_STATUS,
    ISSUE_SEVERITY,
    COLORS,
    PREFIXES
};
