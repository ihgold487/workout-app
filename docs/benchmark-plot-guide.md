# Interpreting the Benchmark Plot

The Benchmark tab is a zone-based e1RM trend view. It separates comparable sets into heavy and moderate work so low-rep strength expression is not mixed with higher-rep performance.

## What is plotted

- **Blue — Heavy:** Sets prescribed for 3–7 reps, completed within that prescribed range, at 0–2 RIR.
- **Green — Moderate:** Sets prescribed for 8–12 reps, completed within that prescribed range, at 0–2 RIR.
- **Faint gray — Low confidence:** A qualifying prescribed heavy or moderate set completed at 3+ RIR. These points provide context but are not connected into either main trend.

For each completed workout, the plot uses only the best qualifying e1RM set in each zone. It does not plot every set. Drop sets are excluded from e1RM calculation.

## e1RM and smoothing

The app estimates e1RM with:

```
weight × (1 + (reps + RIR) / 30)
```

This helps compare differently structured sets, such as 185 × 5 @ 1 RIR and 165 × 10 @ 1 RIR. It remains an estimate rather than a tested one-rep max.

The blue and green values shown on the plot are three-point running averages within their respective zones. Smoothing reduces ordinary workout-to-workout noise. Tapping a point reveals both its displayed smoothed value and the raw set behind it.

## Reading the trends

- A sustained upward blue line suggests improving heavy strength expression.
- A sustained upward green line suggests improving moderate-rep capacity.
- When both move upward together, that is generally the clearest sign of broad progress.
- If blue rises while green stalls or falls, heavy specificity may be improving while moderate capacity lags. The reverse can also happen.
- A single spike is less meaningful than several points moving in the same direction, particularly because e1RM is affected by RIR and rep-reporting accuracy.

Use the **Trend** control to limit the calendar range and optionally display dotted regression lines. The app reports a regression as **Rising** above +0.25 lb/week, **Falling** below −0.25 lb/week, and **Flat** in between. It reports **Limited** until at least four points exist in that zone.

## Heavy / moderate ratio

The Heavy / moderate figure divides the latest smoothed heavy e1RM by the latest smoothed moderate e1RM:

- **Aligned:** 0.990 or higher
- **Slight lag:** 0.960–0.989
- **Lagging:** below 0.960

Treat this as a prompt to inspect the two separate trends, not a verdict. It is most useful when both zones have recent, comparable data; a sparse zone can make the ratio misleading.

## Repeatability

Repeatability examines the latest workout with comparable data, primarily the e1RM change from set 1 to set 2:

- **Stable:** drop of 2% or less
- **Dropping:** drop of 6% or more
- **Watch:** between those values

It is a fatigue and within-session consistency signal, not a direct measure of long-term progress.
