// DATABASE: single source of truth for persistent storage

import Dexie from "dexie";

export const db = new Dexie("WorkoutDB");

db.version(1).stores({
  // GLOBAL EXERCISE DEFINITIONS
  exerciseLibrary: "++id,name,muscleGroup",

  // SAVED TEMPLATES
  templates: "++id,name",

  // COMPLETED WORKOUTS
  sessions: "++id,date",
});

db.version(2).stores({
  // SNAPSHOT OF CURRENT APP DATA
  appData: "&id,updatedAt",

  // LEGACY TABLES RESERVED FOR FUTURE NORMALIZED STORAGE
  exerciseLibrary: "++id,name,muscleGroup",
  templates: "++id,name",
  sessions: "++id,date",
});

db.version(3).stores({
  appData: "&id,updatedAt",
  exerciseLibrary: "++id,name,muscleGroup",
  nutritionOutbox: "&id,userId,operation,updatedAt",
  nutritionSnapshots: "&id,userId,updatedAt",
  sessions: "++id,date",
  templates: "++id,name",
});

db.version(4).stores({
  appData: "&id,updatedAt",
  exerciseLibrary: "++id,name,muscleGroup",
  nutritionBackups: "&id,userId,createdAt",
  nutritionOutbox: "&id,userId,operation,updatedAt",
  nutritionSnapshots: "&id,userId,updatedAt",
  sessions: "++id,date",
  templates: "++id,name",
});

db.version(5).stores({
  appData: "&id,updatedAt",
  exerciseLibrary: "++id,name,muscleGroup",
  nutritionBackups: "&id,userId,createdAt",
  nutritionOutbox: "&id,userId,operation,updatedAt",
  nutritionSnapshots: "&id,userId,updatedAt",
  sessions: "++id,date",
  templates: "++id,name",
  workoutSessionJournal: "&id,updatedAt",
});
