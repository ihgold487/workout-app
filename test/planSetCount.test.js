import assert from "node:assert/strict";
import test from "node:test";
import { getPlanWorkingSetCount } from "../src/utils/planSetCount.js";

test("plan comparison excludes drop-set rows from working-set totals", () => {
  assert.equal(
    getPlanWorkingSetCount({
      sets: [
        { setNumber: 1 },
        { setNumber: 2 },
        { isDropSet: true, setNumber: 3 },
        { is_drop_set: true, set_number: 4 },
      ],
    }),
    2
  );
});
