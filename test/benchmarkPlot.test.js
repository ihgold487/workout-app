import test from "node:test";
import assert from "node:assert/strict";

import {
  getPrescriptionZone,
  parsePrescribedRepRange,
  setMeetsBenchmarkZone,
} from "../src/utils/benchmarkPlot.js";

test("a moderate set exceeding its exact target remains benchmark-eligible", () => {
  const prescriptionZone = getPrescriptionZone(parsePrescribedRepRange("9"));

  assert.equal(prescriptionZone, "moderate");
  assert.equal(
    setMeetsBenchmarkZone({ prescriptionZone, reps: 10 }),
    true
  );
});

test("benchmark eligibility retains the general zone boundaries", () => {
  assert.equal(
    setMeetsBenchmarkZone({ prescriptionZone: "moderate", reps: 13 }),
    false
  );
  assert.equal(
    setMeetsBenchmarkZone({ prescriptionZone: "heavy", reps: 7 }),
    true
  );
  assert.equal(
    setMeetsBenchmarkZone({ prescriptionZone: "heavy", reps: 8 }),
    false
  );
});
