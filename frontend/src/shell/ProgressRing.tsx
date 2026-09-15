import './shell.css';

export interface ProgressRingProps {
  /** How many are done, as read from the file. */
  value: number;
  /** How many there are. Absent means the total is not known. */
  max?: number;
  /** What is being counted, for the accessible name: "sections", "topics". */
  label: string;
  /** Diameter in pixels. */
  size?: number;
}

/**
 * Progress as a ring, and its two numbers.
 *
 * With no total there is no ring at all. A ring needs a fraction, and a
 * fraction with an invented denominator is a number nothing measured (C5).
 * Nor does it show a percentage: "4 of 9" is what the file says, "44%" is
 * arithmetic on top of it that reads as more precise than it is.
 */
export function ProgressRing({ value, max, label, size = 40 }: ProgressRingProps) {
  if (max === undefined || max <= 0) return null;

  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const done = Math.min(Math.max(value, 0), max) / max;

  return (
    <span
      className="sh-ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuemax={max}
      aria-valuetext={`${value} of ${max} ${label}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="sh-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="sh-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="sh-ring-text">
        {value} of {max}
      </span>
    </span>
  );
}
