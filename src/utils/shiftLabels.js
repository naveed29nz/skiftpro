export const SHIFT_LABEL_NAMES = {
  morning: 'Morgen',
  middle: 'Mellom',
  evening: 'Kveld',
  sick: 'Syk',
  sick_self: 'Egenmelding',
  sick_doctor: 'Sykmelding',
  ferie: 'Ferie',
};

export function shiftLabelName(label) {
  return SHIFT_LABEL_NAMES[label] || '';
}

/** Legacy `sick` plus egenmelding and sykmelding. */
export function isSick(label) {
  return label === 'sick' || label === 'sick_self' || label === 'sick_doctor';
}

export function isFullDayAbsence(label) {
  return isSick(label) || label === 'ferie';
}

const SHIFT_LABEL_CHOICES = [
  { value: 'none', label: 'Ingen merking' },
  { value: 'morning', label: '🌅 Morgen' },
  { value: 'middle', label: '☀️ Midt på dagen' },
  { value: 'evening', label: '🌙 Kveld' },
  { value: 'sick_self', label: '🤒 Egenmelding' },
  { value: 'sick_doctor', label: '🏥 Sykmelding' },
  { value: 'ferie', label: '🏖️ Ferie' },
];

const LEGACY_SICK_CHOICE = { value: 'sick', label: '🤒 Syk' };

/**
 * Choices for a new or edited shift. `sick` is only offered while an existing
 * shift still has that stored value, so old rows stay editable and new rows
 * cannot pick it.
 */
export function shiftLabelChoices(current, { noneLabel } = {}) {
  const options = SHIFT_LABEL_CHOICES.map((option, index) => (
    index === 0 && noneLabel ? { ...option, label: noneLabel } : { ...option }
  ));
  if (current === 'sick') {
    const at = options.findIndex((option) => option.value === 'sick_self');
    options.splice(at === -1 ? options.length : at, 0, { ...LEGACY_SICK_CHOICE });
  }
  return options;
}
