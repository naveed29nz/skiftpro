export const SHIFT_LABEL_NAMES = {
  morning: 'Morgen',
  middle: 'Mellom',
  evening: 'Kveld',
  sick: 'Syk',
  ferie: 'Ferie',
};

export function shiftLabelName(label) {
  return SHIFT_LABEL_NAMES[label] || '';
}

export function isFullDayAbsence(label) {
  return label === 'sick' || label === 'ferie';
}
