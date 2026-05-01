export const MOCK_MEETINGS = [
  {
    software: 'Google Meet',
    title: 'Q2 Product Review',
    startTimestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    endTimestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    transcript: [
      { personName: 'Sarah', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), text: "Let's start with the roadmap update." },
      { personName: 'Alex', timestamp: new Date(Date.now() - 119 * 60 * 1000).toISOString(), text: 'We shipped the new dashboard last week.' },
    ],
    chatMessages: [],
    webhookPostStatus: 'successful',
  },
  {
    software: 'Google Meet',
    title: 'Engineering Standup',
    startTimestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    endTimestamp: new Date(Date.now() - 25.5 * 60 * 60 * 1000).toISOString(),
    transcript: [
      { personName: 'Jamie', timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), text: 'No blockers on my end.' },
    ],
    chatMessages: [],
    webhookPostStatus: 'successful',
  },
  {
    software: 'Google Meet',
    title: '1:1 with Manager',
    startTimestamp: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    endTimestamp: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
    transcript: [
      { personName: 'Jordan', timestamp: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(), text: 'How are you feeling about the project timeline?' },
    ],
    chatMessages: [],
    webhookPostStatus: 'failed',
  },
  {
    software: 'Google Meet',
    title: 'Design Review — Navigation Redesign',
    startTimestamp: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    endTimestamp: new Date(Date.now() - 70.5 * 60 * 60 * 1000).toISOString(),
    transcript: [],
    chatMessages: [
      { personName: 'Pat', timestamp: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), text: "Here's the Figma link: figma.com/..." },
    ],
    webhookPostStatus: 'new',
  },
];
