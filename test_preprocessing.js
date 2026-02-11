const { preprocessMessagesAdvanced } = require('./src/utils/ai');

// Mock data with various scenarios
const mockMessages = [
    {
        username: 'CodeUser',
        content: 'Here is how you do it:\n```javascript\nconst x = 1;\nconsole.log(x);\n```\nAnd inline `code` too!',
        timestamp: Date.now()
    },
    {
        username: 'FormatFan',
        content: '**Bold** statement! *Italic* remarks. __Underlined__ truth. ||Spoiler|| alert!',
        timestamp: Date.now()
    },
    {
        username: 'EmojiLover',
        content: 'Hello! 👋 This is great! 🚀 <a:custom:123456> :smile:',
        timestamp: Date.now()
    },
    {
        username: 'WhitespaceKing',
        content: 'This    has    way    too    many    spaces.\n\n\nAnd newlines!',
        timestamp: Date.now()
    },
    {
        username: 'LinkPoster',
        content: 'Check this out: https://www.verylongdomainname.com/some/extremely/long/path/with/parameters?id=12345&ref=abcdefg&token=xyz123',
        timestamp: Date.now()
    },
    {
        username: 'LongWinded',
        content: 'This is a very long message that goes on and on. It has multiple sentences. We want to see if it truncates correctly at a sentence boundary. It should not just cut off in the middle of a word because that would be confusing. Hopefully this logic works as intended and preserves the context of what is being said while saving tokens.',
        timestamp: Date.now()
    }
];

// Test Case 1: Standard /ask options (aggressive)
console.log('\n--- Test Case 1: Aggressive Preprocessing (/ask default) ---');
const options1 = {
    removeFormatting: true,
    removeMentions: false,
    removeEmojis: true,
    removeCodeBlocks: true,
    aggressiveWhitespace: true,
    maxMessageLength: 100, // Short limit to test truncation
    shortenUrls: true,
    preserveContext: true
};

const results1 = preprocessMessagesAdvanced(mockMessages, options1);

results1.forEach((msg, i) => {
    console.log(`\nOriginal (${mockMessages[i].content.length} chars): ${JSON.stringify(mockMessages[i].content)}`);
    console.log(`Processed (${msg.processedLength} chars): ${JSON.stringify(msg.content)}`);
});

// Test Case 2: Standard /analyse options (less aggressive)
console.log('\n--- Test Case 2: Standard Analysis (preserve emojis/code) ---');
const options2 = {
    removeFormatting: true,
    removeMentions: false,
    removeEmojis: false,
    removeCodeBlocks: false, // Keep code for analysis
    aggressiveWhitespace: true,
    maxMessageLength: 200,
    shortenUrls: false
};

// Just test the code message for this case
const results2 = preprocessMessagesAdvanced([mockMessages[0]], options2);
console.log(`\nOriginal: ${JSON.stringify(mockMessages[0].content)}`);
console.log(`Processed: ${JSON.stringify(results2[0].content)}`);
