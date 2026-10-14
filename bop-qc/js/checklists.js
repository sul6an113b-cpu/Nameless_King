// PLACEHOLDER - replaced by the researched library.
export const CHECKLIST_VERSION = 'draft';
export const TYPES = [
  { key: 'piping_line', label: 'Piping line', checks: [
    { id: 'supports', group: 'Supports', text: 'Supports installed as drawn', basis: 'project', codeRef: '', defects: ['Support missing', 'Wrong support type'], ask: 'Which support drawing rev applies?' },
    { id: 'temp_sup', group: 'Supports', text: 'No temporary supports left', basis: 'practice', codeRef: '', defects: ['Temporary support left'], ask: '' },
    { id: 'drains', group: 'Drains', text: 'Drains and vents installed', basis: 'project', codeRef: '', defects: ['Drain missing'], ask: 'Where are high-point vents required?' },
  ] },
  { key: 'free', label: 'Other / free check', checks: [] },
];
export const CLOSURE_CHECKS = [
  { id: 'reinspected', text: 'Actual condition re-inspected on site' },
  { id: 'matches', text: 'Fix matches the original comment' },
];
export const SITE_QUESTIONS = {};
export const GENERAL_DEFECTS = ['Housekeeping', 'Tag missing'];
