// DATABASE: single source of truth for persistent storage

import Dexie from "dexie"

export const db =
  new Dexie(
    "WorkoutDB"
  )

db.version(1).stores({

  // GLOBAL EXERCISE DEFINITIONS
  exerciseLibrary:
    "++id,name,muscleGroup",

  // SAVED TEMPLATES
  templates:
    "++id,name",

  // COMPLETED WORKOUTS
  sessions:
    "++id,date"

})