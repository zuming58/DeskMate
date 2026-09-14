// Synthetic fixture only, loaded exclusively by the isolated UI probe window.
if (!localStorage.getItem('deskmate-ui-probe-seeded')) {
  localStorage.setItem('deskmate.app-state', JSON.stringify({ schemaVersion: 15, history: [{ id: 'probe-1', text: 'Synthetic test only', rawText: 'Synthetic source', time: '10:00', date: '2099-01-01' }], vocabulary: { hotwords: ['Probe'], rules: [{ id: 'rule-1', from: 'before', to: 'after' }] } }));
  localStorage.setItem('deskmate-ui-probe-seeded', 'true');
}
