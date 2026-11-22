export interface SpinnerProps {
  label?: string;
}

export default function Spinner({ label = "Loading" }: SpinnerProps) {
  return (
    <div role="status" className="inline-flex items-center gap-2 text-slate-600">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-accent-teal"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

