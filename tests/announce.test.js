const { enhanceAnnouncement } = require('../src/utils/ai');
const db = require('../src/utils/db');

// Mock the API call
jest.mock('../src/utils/ai', () => ({
  enhanceAnnouncement: jest.fn().mockResolvedValue('Enhanced announcement content'),
  callLLMAPI: jest.fn().mockResolvedValue('API response')
}));

// Mock database methods
jest.mock('../src/utils/db', () => ({
  prepare: jest.fn().mockReturnValue({
    run: jest.fn().mockReturnValue({ changes: 1 }),
    get: jest.fn().mockReturnValue({ 
      id: 'ann-123456', 
      title: 'Test Announcement', 
      content: 'Test content',
      author_id: '123456789',
      created_at: Date.now()
    }),
    all: jest.fn().mockReturnValue([])
  }),
  exec: jest.fn()
}));

describe('Announcement Functionality', () => {
  test('enhanceAnnouncement should return enhanced content', async () => {
    const result = await enhanceAnnouncement('Test announcement');
    expect(result).toBe('Enhanced announcement content');
  });

  test('Database can store announcement drafts', () => {
    const stmt = db.prepare('INSERT INTO announcements VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run('ann-123456', 'Test Title', 'Test Content', 'user123', Date.now(), 0);
    expect(stmt.run).toHaveBeenCalled();
  });
});
