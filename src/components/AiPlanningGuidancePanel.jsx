import { ChevronDown } from "lucide-react";
import { summarizeAiPlanningGuidance } from "../plans/aiPlanningGuidance";

const fieldStyle = {
  boxSizing: "border-box",
  font: "inherit",
  minHeight: "40px",
  padding: "6px 8px",
  width: "100%",
};

const labelStyle = {
  display: "grid",
  gap: "4px",
  textAlign: "left",
};

function GuidanceSection({ children, title }) {
  return (
    <details
      style={{
        borderTop: "1px solid var(--border)",
        paddingTop: "8px",
      }}
    >
      <summary
        style={{
          alignItems: "center",
          cursor: "pointer",
          display: "flex",
          fontWeight: 600,
          gap: "6px",
          listStyle: "none",
          textAlign: "left",
        }}
      >
        <ChevronDown size={15} />
        {title}
      </summary>
      <div style={{ display: "grid", gap: "10px", paddingTop: "10px" }}>
        {children}
      </div>
    </details>
  );
}

function TwoColumnFields({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "8px",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      }}
    >
      {children}
    </div>
  );
}

function NumberField({ label, max, min = 1, onChange, value }) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        inputMode="numeric"
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        style={fieldStyle}
        type="number"
        value={value}
      />
    </label>
  );
}

export default function AiPlanningGuidancePanel({ guidance, onChange }) {
  const update = (field, value) => onChange({ ...guidance, [field]: value });
  const priorityOptions = (
    <>
      <option value="high">High</option>
      <option value="moderate">Moderate</option>
      <option value="low">Low</option>
      <option value="notAGoal">Not a goal</option>
    </>
  );

  return (
    <section
      aria-label="AI planning guidance"
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        display: "grid",
        gap: "8px",
        padding: "10px",
      }}
    >
      <div style={{ fontWeight: 700, textAlign: "left" }}>
        AI planning guidance
      </div>
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "12px",
          lineHeight: 1.45,
          textAlign: "left",
        }}
      >
        These saved preferences are added to the existing training history and
        analysis. They do not replace the established context.
      </div>
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "6px",
          fontSize: "12px",
          lineHeight: 1.45,
          padding: "8px",
          textAlign: "left",
        }}
      >
        {summarizeAiPlanningGuidance(guidance)}
      </div>

      <GuidanceSection title="Goals and current priorities">
        <TwoColumnFields>
          <label style={labelStyle}>
            Strength
            <select
              onChange={(event) => update("strengthPriority", event.target.value)}
              style={fieldStyle}
              value={guidance.strengthPriority}
            >
              {priorityOptions}
            </select>
          </label>
          <label style={labelStyle}>
            Hypertrophy
            <select
              onChange={(event) =>
                update("hypertrophyPriority", event.target.value)
              }
              style={fieldStyle}
              value={guidance.hypertrophyPriority}
            >
              {priorityOptions}
            </select>
          </label>
        </TwoColumnFields>
        <label style={labelStyle}>
          Muscle hypertrophy priorities
          <input
            onChange={(event) =>
              update("muscleHypertrophyPriorities", event.target.value)
            }
            placeholder="Chest, Lats, Quads"
            style={fieldStyle}
            value={guidance.muscleHypertrophyPriorities}
          />
        </label>
        <label style={labelStyle}>
          Exercise strength priorities
          <input
            onChange={(event) =>
              update("exerciseStrengthPriorities", event.target.value)
            }
            placeholder="Bench Press, Pull-Up"
            style={fieldStyle}
            value={guidance.exerciseStrengthPriorities}
          />
        </label>
        <label style={labelStyle}>
          Next block emphasis
          <select
            onChange={(event) => update("blockEmphasis", event.target.value)}
            style={fieldStyle}
            value={guidance.blockEmphasis}
          >
            <option value="aiDecides">AI decides from history</option>
            <option value="balanced">Balanced</option>
            <option value="strength">Strength emphasis</option>
            <option value="hypertrophy">Hypertrophy emphasis</option>
          </select>
        </label>
      </GuidanceSection>

      <GuidanceSection title="Schedule and block length">
        <label style={labelStyle}>
          Days per week
          <select
            onChange={(event) => update("daysMode", event.target.value)}
            style={fieldStyle}
            value={guidance.daysMode}
          >
            <option value="fixed">Fixed</option>
            <option value="range">Range</option>
            <option value="aiDecides">AI decides</option>
          </select>
        </label>
        {guidance.daysMode !== "aiDecides" && (
          <TwoColumnFields>
            <NumberField
              label={guidance.daysMode === "fixed" ? "Days" : "Minimum days"}
              max={7}
              onChange={(value) => update("daysMin", value)}
              value={guidance.daysMin}
            />
            {guidance.daysMode === "range" && (
              <NumberField
                label="Maximum days"
                max={7}
                onChange={(value) => update("daysMax", value)}
                value={guidance.daysMax}
              />
            )}
          </TwoColumnFields>
        )}
        <label style={labelStyle}>
          Training weeks
          <select
            onChange={(event) => update("weeksMode", event.target.value)}
            style={fieldStyle}
            value={guidance.weeksMode}
          >
            <option value="fixed">Fixed</option>
            <option value="range">Range</option>
            <option value="aiDecides">AI decides</option>
          </select>
        </label>
        {guidance.weeksMode !== "aiDecides" && (
          <TwoColumnFields>
            <NumberField
              label={
                guidance.weeksMode === "fixed" ? "Weeks" : "Minimum weeks"
              }
              max={52}
              onChange={(value) => update("weeksMin", value)}
              value={guidance.weeksMin}
            />
            {guidance.weeksMode === "range" && (
              <NumberField
                label="Maximum weeks"
                max={52}
                onChange={(value) => update("weeksMax", value)}
                value={guidance.weeksMax}
              />
            )}
          </TwoColumnFields>
        )}
        <label style={labelStyle}>
          Deload
          <select
            onChange={(event) => update("deloadMode", event.target.value)}
            style={fieldStyle}
            value={guidance.deloadMode}
          >
            <option value="required">Required</option>
            <option value="aiDecides">AI decides</option>
            <option value="none">Do not schedule</option>
          </select>
        </label>
      </GuidanceSection>

      <GuidanceSection title="Workout constraints">
        <label
          style={{ alignItems: "center", display: "flex", gap: "8px", textAlign: "left" }}
        >
          <input
            checked={guidance.workoutDurationEnabled}
            onChange={(event) =>
              update("workoutDurationEnabled", event.target.checked)
            }
            type="checkbox"
          />
          Constrain estimated workout duration
        </label>
        {guidance.workoutDurationEnabled && (
          <div
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            }}
          >
            <NumberField
              label="Min"
              max={240}
              onChange={(value) => update("workoutMinutesMin", value)}
              value={guidance.workoutMinutesMin}
            />
            <NumberField
              label="Target"
              max={240}
              onChange={(value) => update("workoutMinutesTarget", value)}
              value={guidance.workoutMinutesTarget}
            />
            <NumberField
              label="Max"
              max={240}
              onChange={(value) => update("workoutMinutesMax", value)}
              value={guidance.workoutMinutesMax}
            />
          </div>
        )}
        <TwoColumnFields>
          <NumberField
            label="Minimum sets/exercise"
            max={12}
            onChange={(value) => update("setsMin", value)}
            value={guidance.setsMin}
          />
          <NumberField
            label="Maximum sets/exercise"
            max={12}
            onChange={(value) => update("setsMax", value)}
            value={guidance.setsMax}
          />
        </TwoColumnFields>
        <label style={labelStyle}>
          Rest intervals
          <select
            onChange={(event) => update("restMode", event.target.value)}
            style={fieldStyle}
            value={guidance.restMode}
          >
            <option value="aiDecides">AI decides</option>
            <option value="appDefaults">Use app defaults</option>
          </select>
        </label>
        {guidance.restMode === "aiDecides" && (
          <NumberField
            label="Optional maximum rest (seconds)"
            max={900}
            onChange={(value) => update("restMaximumSeconds", value)}
            value={guidance.restMaximumSeconds}
          />
        )}
        <label style={labelStyle}>
          Supersets
          <select
            onChange={(event) => update("supersetMode", event.target.value)}
            style={fieldStyle}
            value={guidance.supersetMode}
          >
            <option value="aiDecides">AI decides</option>
            <option value="allowed">Allowed</option>
            <option value="avoid">Avoid</option>
          </select>
        </label>
      </GuidanceSection>

      <GuidanceSection title="Exercise guidance and notes">
        <label style={labelStyle}>
          Required exercises
          <input
            onChange={(event) => update("requiredExercises", event.target.value)}
            placeholder="Comma-separated exercise names"
            style={fieldStyle}
            value={guidance.requiredExercises}
          />
        </label>
        <label style={labelStyle}>
          Preferred exercises
          <input
            onChange={(event) => update("preferredExercises", event.target.value)}
            placeholder="Comma-separated exercise names"
            style={fieldStyle}
            value={guidance.preferredExercises}
          />
        </label>
        <label style={labelStyle}>
          Exercises to avoid
          <input
            onChange={(event) => update("avoidedExercises", event.target.value)}
            placeholder="Comma-separated exercise names"
            style={fieldStyle}
            value={guidance.avoidedExercises}
          />
        </label>
        <label style={labelStyle}>
          Additional notes
          <textarea
            onChange={(event) => update("userNotes", event.target.value)}
            placeholder="Injuries, recovery constraints, schedule details, or anything else the AI should consider"
            style={{ ...fieldStyle, minHeight: "92px", resize: "vertical" }}
            value={guidance.userNotes}
          />
        </label>
      </GuidanceSection>
    </section>
  );
}
