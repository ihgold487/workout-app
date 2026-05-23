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

import { equipmentOptions } from "../data/seedExercises"

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
              id="equipment"
            >
              <option value="">
                Equipment
              </option>
              {
                equipmentOptions.map(
                  item => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  )                )

              }
            </select>


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
                  
              const equipment =
                document
                  .getElementById(
                    "equipment"
                  )
                  .value


                if (!name) {

                  alert(
                    "Exercise name required"
                  )

                  return
                }          

              setExerciseLibrary([

                ...exerciseLibrary,

                {
                  id:
                    Date.now(),

                  name,

                  muscles:
                    [muscleGroup],

                  equipment:
                    equipment
                      ?
                      [equipment]
                      :
                      []
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

                  ex.muscles?.[0]
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

                 <div
                    style={{
                      display:
                        "flex",

                      justifyContent:
                        "space-between",

                      alignItems:
                        "center"
                    }}
                  >

                    <div
                      style={{
                        fontWeight:
                          "bold"
                      }}
                    >

                      {
                        `${exercise.name}${
                          exercise.equipment?.[0]
                            ? ", " + exercise.equipment[0]
                            : ""
                        }`
                      }

                    </div>

                    <button

                      onClick={() =>

                        setExerciseLibrary(

                          exerciseLibrary.filter(
                            e =>
                              e.id
                              !==
                              exercise.id
                          )

                        )

                      }

                    >

                      🗑️

                    </button>

                  </div>

                  <div
                    style={{
                      textAlign:
                        "left",

                      fontSize:
                        "0.9em"
                    }}
                  >

                    {
                      exercise.muscles?.join(
                        ", "
                      )
                    }

                  </div>

                  <br />

                </div>

              ))

        }
    </div>

  )

}