/** The usual names of the CSS weights. */
const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

/** `700 Bold`, or the bare number for a weight without a usual name. */
export const weightLabel = (w: number) => (WEIGHT_NAMES[w] ? `${w} ${WEIGHT_NAMES[w]}` : String(w));
