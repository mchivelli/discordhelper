// Simple demo for Task Templates and AI Features
// This script shows the task templates in a user-friendly way

// Import the task templates
const templates = {
  // Web development project template
  "web": {
    name: "Web Development",
    stages: [
      { name: "Planning", description: "Define requirements, create wireframes, and plan project architecture." },
      { name: "Design", description: "Create visual designs and UI/UX elements." },
      { name: "Development", description: "Implement frontend and backend functionality." },
      { name: "Testing", description: "Perform functional testing, fix bugs, and optimize performance." },
      { name: "Deployment", description: "Deploy to production environment and document the project." }
    ]
  },
  
  // Meeting preparation template
  "meeting": {
    name: "Meeting Preparation",
    stages: [
      { name: "Agenda Setting", description: "Define meeting goals and create a detailed agenda." },
      { name: "Preparation", description: "Prepare necessary materials and supporting documents." },
      { name: "Invitations", description: "Send invitations to all participants with relevant information." },
      { name: "Facilitation", description: "Host the meeting and ensure all agenda items are covered." },
      { name: "Follow-up", description: "Document decisions and distribute action items to participants." }
    ]
  },
  
  // Content creation template
  "content": {
    name: "Content Creation",
    stages: [
      { name: "Research", description: "Gather information and identify key points." },
      { name: "Outline", description: "Create a structured outline of the content." },
      { name: "Draft", description: "Write the first draft of the content." },
      { name: "Review", description: "Review and refine the content for quality." },
      { name: "Publish", description: "Finalize and publish the content to the target platform." }
    ]
  },
  
  // Bug fixing template
  "bugfix": {
    name: "Bug Fixing",
    stages: [
      { name: "Reproduction", description: "Verify and document the steps to reproduce the bug." },
      { name: "Analysis", description: "Analyze the code to identify the root cause." },
      { name: "Implementation", description: "Implement the necessary fixes." },
      { name: "Testing", description: "Test the fix thoroughly to ensure the bug is resolved." },
      { name: "Release", description: "Release the fix to production." }
    ]
  },
  
  // Event planning template
  "event": {
    name: "Event Planning",
    stages: [
      { name: "Initial Planning", description: "Define event goals, budget, and timeline." },
      { name: "Logistics", description: "Book venue, arrange catering, and organize equipment." },
      { name: "Promotion", description: "Create and distribute promotional materials." },
      { name: "Execution", description: "Manage the event on the day." },
      { name: "Follow-up", description: "Send thank-yous, collect feedback, and review outcomes." }
    ]
  }
};

// Visual progress indicators
function createProgressBar(percentage) {
  const filledChar = '■';
  const emptyChar = '□';
  const barLength = 15; // Slightly shorter bar to fit better in Discord
  const filledLength = Math.round((percentage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  
  const filled = filledChar.repeat(filledLength);
  const empty = emptyChar.repeat(emptyLength);
  
  // Add emoji indicators based on progress
  let statusEmoji = '';
  if (percentage === 0) {
    statusEmoji = '🆕 ';
  } else if (percentage < 25) {
    statusEmoji = '🔄 ';
  } else if (percentage < 50) {
    statusEmoji = '⚙️ ';
  } else if (percentage < 75) {
    statusEmoji = '📈 ';
  } else if (percentage < 100) {
    statusEmoji = '🔜 ';
  } else {
    statusEmoji = '✅ ';
  }
  
  return `${statusEmoji}${filled}${empty} ${percentage}%`;
}

// Date formatting with contextual indicators
function formatDate(timestamp) {
  if (!timestamp) return 'No date set';
  
  try {
    // Try to parse the input as a date string first
    let date;
    if (typeof timestamp === 'string') {
      // Handle DD.MM.YYYY format (convert to YYYY-MM-DD for parsing)
      if (timestamp.includes('.')) {
        const parts = timestamp.split('.');
        if (parts.length === 3) {
          timestamp = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      date = new Date(timestamp);
    } else {
      // Handle as timestamp
      date = new Date(timestamp);
    }
    
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    
    // Format as DD.MM.YYYY
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    // Add emoji and special indicator for dates close to today
    let prefix = '';
    
    // Check if date is in the past
    if (date < today && date.toDateString() !== today.toDateString()) {
      prefix = '⚠️ ';
    } else if (isToday) {
      prefix = '📅 Today: ';
    } else if (isTomorrow) {
      prefix = '📆 Tomorrow: ';
    } else {
      // Calculate days until the date
      const diffTime = date.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= 7) {
        prefix = `🔜 In ${diffDays} day${diffDays > 1 ? 's' : ''}: `;
      } else if (diffDays > 7 && diffDays <= 14) {
        prefix = `📅 In ${Math.floor(diffDays / 7)} week: `;
      }
    }
    
    return `${prefix}${day}.${month}.${year}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return String(timestamp) || 'Unknown date';
  }
}

// Demo function - shows the templates and progress indicators
function runDemo() {
  console.log('===== TASK TEMPLATES DEMO =====\n');
  
  // Show the available templates
  console.log('Available Task Templates:');
  for (const [id, template] of Object.entries(templates)) {
    console.log(`\n--- ${template.name} (${id}) ---`);
    console.log('Stages:');
    
    template.stages.forEach((stage, index) => {
      console.log(`${index + 1}. ${stage.name}`);
      console.log(`   Description: ${stage.description}`);
    });
  }
  
  console.log('\n\n===== PROGRESS VISUALIZATION DEMO =====\n');
  
  // Show progress bars
  const percentages = [0, 15, 33, 50, 75, 90, 100];
  console.log('Task Progress Visualization:');
  percentages.forEach(pct => {
    console.log(`${pct}%: ${createProgressBar(pct)}`);
  });
  
  console.log('\n\n===== DATE FORMATTING DEMO =====\n');
  
  // Show date formatting
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  const nextMonth = new Date(today);
  nextMonth.setMonth(today.getMonth() + 1);
  
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  
  console.log('Date Formatting Examples:');
  console.log(`Today's date: ${formatDate(today.toISOString().split('T')[0])}`);
  console.log(`Tomorrow's date: ${formatDate(tomorrow.toISOString().split('T')[0])}`);
  console.log(`Next week: ${formatDate(nextWeek.toISOString().split('T')[0])}`);
  console.log(`Next month: ${formatDate(nextMonth.toISOString().split('T')[0])}`);
  console.log(`Yesterday (overdue): ${formatDate(yesterday.toISOString().split('T')[0])}`);
  
  console.log('\n===== ANALYTICS DASHBOARD (MOCKUP) =====\n');
  
  // Show analytics dashboard mockup
  console.log('📊 Task Analytics Dashboard');
  console.log('---------------------------');
  console.log('📋 Total Tasks: 12');
  console.log('✅ Completed: 5 (42%)');
  console.log('⏱️ In Progress: 4');
  console.log('🆕 Not Started: 3');
  console.log('\n📈 Task Completion Rate:');
  console.log(createProgressBar(42));
  
  console.log('\n🎉 Recent Task Completions:');
  console.log('• `t12345` **Website Homepage** - 2 days ago');
  console.log('• `t12346` **Team Meeting** - 1 week ago');
  
  console.log('\n⏰ Upcoming Deadlines:');
  console.log('• `t12347` **Product Launch**');
  console.log(`  ${formatDate(nextWeek.toISOString().split('T')[0])}`);
  console.log(`  ${createProgressBar(75)}`);
  
  console.log('\n• `t12348` **Quarterly Report**');
  console.log(`  ${formatDate(nextMonth.toISOString().split('T')[0])}`);
  console.log(`  ${createProgressBar(25)}`);
  
  console.log('\n===== END OF DEMO =====');
}

// Run the demo
runDemo();
