/**
 * Task templates for quick task creation
 * These templates provide pre-defined stages for common task types
 */

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
