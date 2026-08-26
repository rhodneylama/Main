import type { Difficulty } from "@/lib/types";

const COLORS: Record<Difficulty, string> = {
  1: "bg-good",
  2: "bg-good",
  3: "bg-warn",
  4: "bg-warn",
  5: "bg-bad",
};

export default function DifficultyDots({ value }: { value: Difficulty }) {
  return (
    <span className="flex shrink-0 items-center gap-1" title={`Difficulty ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${n <= value ? COLORS[value] : "bg-edge"}`}
        />
      ))}
    </span>
  );
}
