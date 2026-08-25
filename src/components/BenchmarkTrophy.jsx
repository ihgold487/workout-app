import { Trophy } from "lucide-react";

const BENCHMARK_TROPHY_COLOR = "#ca8a04";

export default function BenchmarkTrophy({ size = 16, style }) {
  return (
    <Trophy
      aria-label="Benchmark exercise"
      color={BENCHMARK_TROPHY_COLOR}
      role="img"
      size={size}
      strokeWidth={2.5}
      style={{ flexShrink: 0, ...style }}
    />
  );
}
