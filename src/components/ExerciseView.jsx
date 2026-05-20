const muscleGroups = [
  "Abs",
  "Biceps",
  "Calves",
  "Chest",
  "Forearms",
  "Front Delts",
  "Full Body",
  "Glutes",
  "Hamstrings",
  "Lats",
  "Quads",
  "Rear Delts",
  "Side Delts",
  "Triceps",
  "Upper Back",
  "Other"
]

import { useState } from "react"

export default function ExerciseView({
  exerciseLibrary,
  setExerciseLibrary,
  setShowExercises
}) {

    const [
      selectedMuscle,
      setSelectedMuscle
    ] =
    useState("")

  return (

    <div style={{
      padding:
        "20px"
    }}>

      <button
        onClick={() =>
          setShowExercises(
            false
          )
        }
      >

        ← Back

      </button>



      <h1>

        Exercises

      </h1>


        <div>

          <input

            id="newExercise"

            placeholder=
              "Exercise name"

          />


          <select
            id="muscleGroup"
          >

            {

              muscleGroups.map(
                muscle => (

                  <option

                    key={
                      muscle
                    }

                    value={
                      muscle
                    }

                  >

                    {

                      muscle

                    }

                  </option>

                ))

            }

          </select>



          <button

            onClick={() => {

              const name =

                document
                  .getElementById(
                    "newExercise"
                  )
                  .value


              const muscleGroup =

                document
                  .getElementById(
                    "muscleGroup"
                  )
                  .value


              if (!name)
                return


              setExerciseLibrary([

                ...exerciseLibrary,

                {

                  id:
                    Date.now(),

                  name,

                  muscleGroup

                }

              ])

            }}

          >

            + Add Exercise

          </button>

        </div>


      <hr />

        <label>

          Filter:

        </label>

        {" "}

        <select
          value={
            selectedMuscle
          }

          onChange={
            e =>

              setSelectedMuscle(
                e.target.value
              )
          }

        >

        <option value="">
          All Muscles
        </option>

        {

          muscleGroups.map(
            muscle => (

              <option
                key={muscle}
                value={muscle}
              >

                {muscle}

              </option>

            )
          )

        }

        </select>

        <hr />



        {

          [...exerciseLibrary]

              .filter(
                ex =>

                  !selectedMuscle

                  ||

                  ex.muscleGroup
                  ===
                  selectedMuscle
              )

              .sort(

              (a,b) =>

                a.name.localeCompare(
                  b.name
                )

            )

            .map(
              exercise => (

                <div
                  key={
                    exercise.id
                  }
                >

                  {

                    exercise.name

                  }


                  {" — "}


                  {

                    exercise.muscleGroup

                    ||

                    "Uncategorized"

                  }


                  {" "}


                  <button

                    onClick={() =>

                      setExerciseLibrary(

                        exerciseLibrary.filter(
                          ex =>

                            ex.id !==
                            exercise.id
                        )

                      )

                    }

                  >

                    Delete

                  </button>

                </div>

              ))

        }
    </div>

  )

}