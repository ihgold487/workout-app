import { useState } from "react"

export default function SessionView({
  session,
  sessions,
  setSessions,
  history,
  setHistory,
  templates,
  setTemplates,
  exerciseLibrary,
  setSelectedSessionId
}) {

  const [showAddExercise, setShowAddExercise] =
    useState(false)

  const [search, setSearch] = useState("")
  
  const [selectedMuscle, setSelectedMuscle] = useState("")

  function updateSession(updater) {

    setSessions(

      sessions.map(
        s =>

          s.id === session.id

            ? updater(s)

            : s
      )

    )

  }



  function updateActual(
    exerciseId,
    setId,
    field,
    value
  ) {

    updateSession(

      s => ({

        ...s,

        exercises:

          s.exercises.map(
            ex =>

              ex.id === exerciseId

                ? {

                    ...ex,

                    sets:

                      ex.sets.map(
                        set =>

                          set.id === setId

                            ? {
                                ...set,
                                [field]:
                                  value
                              }

                            : set
                      )

                  }

                : ex
          )

      })

    )

  }



  function deleteSet(
    exerciseId,
    setId
  ) {

    updateSession(

      s => ({

        ...s,

        exercises:

          s.exercises.map(
            ex =>

              ex.id === exerciseId

                ? {

                    ...ex,

                    sets:

                      ex.sets.filter(
                        set =>
                          set.id !== setId
                      )

                  }

                : ex
          )

      })

    )

  }



  function addSet(
    exerciseId,
    lastSet
  ) {

    const newSet = {

      id:
        Date.now(),

      targetWeight:
        lastSet?.targetWeight
        || "",

      targetReps:
        lastSet?.targetReps
        || "",

      actualWeight:
        "",

      actualReps:
        ""

    }


    updateSession(

      s => ({

        ...s,

        exercises:

          s.exercises.map(
            ex =>

              ex.id === exerciseId

                ? {

                    ...ex,

                    sets: [
                      ...ex.sets,
                      newSet
                    ]

                  }

                : ex
          )

      })

    )

  }



  function deleteExercise(
    exerciseId
  ) {

    updateSession(

      s => ({

        ...s,

        exercises:

          s.exercises.filter(
            ex =>
              ex.id !== exerciseId
          )

      })

    )

  }



  function addExercise(
    exercise
  ) {

    const weight =
      prompt("Target weight")

    const reps =
      prompt("Target reps")

    const numSets =
      Number(
        prompt(
          "Number of sets"
        )
      )


    const sets =

      Array.from(

        {
          length:
            numSets
        },

        () => ({

          id:
            Date.now()
            + Math.random(),

          targetWeight:
            weight,

          targetReps:
            reps,

          actualWeight:
            "",

          actualReps:
            ""

        })

      )


    updateSession(

      s => ({

        ...s,

        exercises: [

          ...s.exercises,

          {

            id:
              Date.now(),

            name:
              exercise.name,

            supersetGroup:
              null,

            sets

          }

        ]

      })

    )

  }

    const filteredExercises =

      exerciseLibrary

        .filter(
          exercise =>

            (

              !selectedMuscle

              ||

              exercise
                .muscleGroup

                ===

              selectedMuscle

            )

            &&

            exercise.name
              .toLowerCase()

              .includes(
                search
                  .toLowerCase()
              )

        )


        .sort(

          (a, b) =>

            a.name.localeCompare(
              b.name
            )

        )


  const groupedExercises =

    Object.values(

      session.exercises.reduce(

        (
          groups,
          exercise
        ) => {

          const key =

            exercise.supersetGroup

            ||

            `single-${exercise.id}`


          if (
            !groups[key]
          ) {

            groups[key] = {

              group:
                exercise.supersetGroup,

              exercises:
                []

            }

          }


          groups[key]
            .exercises
            .push(
              exercise
            )


          return groups

        },

        {}

      )

    )



  return (

    <div style={{
      padding:
        "20px"
    }}>

      <button
        onClick={() =>
          setSelectedSessionId(
            null
          )
        }
      >

        ← Back

      </button>



      <h1>

        {
          session.templateName
        }

      </h1>



      <button
        onClick={() =>
          setShowAddExercise(
            !showAddExercise
          )
        }
      >

        + Add Exercise

      </button>



      {

        showAddExercise &&

        <div>
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



            <input

              placeholder=
                "Search exercise"

              value={
                search
              }

              onChange={
                e =>

                  setSearch(
                    e.target.value
                  )
              }

            />
          {

            filteredExercises.map(
              ex => (

                <button

                  key={ex.id}

                  onClick={() =>
                    addExercise(ex)
                  }

                >

                  {
                    ex.name
                  }

                </button>

              ))

          }

        </div>

      }



      <hr />



      {

        groupedExercises.map(
          group => (

            <div

              key={
                group.group
                ||
                group.exercises[0]
                  .id
              }

              style={{

                border:

                  group.group

                    ?

                    "2px solid #666"

                    :

                    "none",

                padding:
                  "12px",

                marginBottom:
                  "24px",

                borderRadius:
                  "8px"

              }}

            >

              {

                group.group &&

                <h2>

                  ════ Set {

                    group.group

                  } ════

                </h2>

              }



              {

                group.exercises.map(
                  exercise => (

                    <div

                      key={
                        exercise.id
                      }

                      style={{
                        marginBottom:
                          "20px"
                      }}

                    >

                      <h3>

                        {
                          exercise.name
                        }


                        {" "}


                        <button

                          onClick={() =>

                            deleteExercise(
                              exercise.id
                            )

                          }

                        >

                          Delete

                        </button>

                      </h3>
                      
                        <textarea

                          placeholder=
                            "Notes"

                          value={
                            exercise.note
                            ||
                            ""
                          }

                          onChange={
                            e =>

                              updateSession(

                                s => ({

                                  ...s,

                                  exercises:

                                    s.exercises.map(
                                      ex =>

                                        ex.id ===
                                        exercise.id

                                          ?

                                          {

                                            ...ex,

                                            note:
                                              e.target.value

                                          }

                                          :

                                          ex
                                    )

                                })

                              )
                          }

                          style={{

                            width:
                              "100%",

                            height:
                              "50px",

                            marginBottom:
                              "10px"

                          }}

                        />
                      {

                        exercise.sets.map(
                          set => (

                            <div
                              key={
                                set.id
                              }
                            >

                              Target:

                              {" "}

                              {
                                set.targetWeight
                              }

                              ×

                              {
                                set.targetReps
                              }


                              {" | "}


                              Actual:


                             <input

                                  style={{

                                    width:
                                      "60px",

                                    marginLeft:
                                      "6px"

                                  }}

                                  value={
                                    set.actualWeight
                                  }

                                  onChange={
                                    e =>

                                      updateActual(

                                        exercise.id,

                                        set.id,

                                        "actualWeight",

                                        e.target.value

                                      )
                                  }

                                />


                              ×


                              <input

                                  style={{

                                    width:
                                      "40px",

                                    marginLeft:
                                      "6px"

                                  }}

                                  value={
                                    set.actualReps
                                  }

                                  onChange={
                                    e =>

                                      updateActual(

                                        exercise.id,

                                        set.id,

                                        "actualReps",

                                        e.target.value

                                      )
                                  }

                                />

                              <button

                                onClick={() =>

                                  deleteSet(

                                    exercise.id,

                                    set.id

                                  )

                                }

                              >

                                Delete Set

                              </button>

                            </div>

                          ))

                      }



                      <button

                        onClick={() =>

                          addSet(

                            exercise.id,

                            exercise.sets[
                              exercise.sets.length - 1
                            ]

                          )

                        }

                      >

                        + Add Set

                      </button>

                    </div>

                  ))

              }

            </div>

          ))

        }



        <hr />



        <button

          onClick={() => {

            const completedWorkout = {

              ...session,

              completedAt:

                new Date()
                  .toLocaleDateString()

            }



            setHistory([

              completedWorkout,

              ...history

            ])



            setTemplates(

              templates.map(
                t =>

                  t.id ===
                  session.templateId

                    ?

                    {

                      ...t,

                      lastCompleted:

                        completedWorkout
                          .completedAt,


                      exercises:

                        session.exercises
                          .map(
                            ex => ({

                              ...ex,

                              sets:

                                ex.sets

                                  .filter(
                                    set =>

                                      set.actualWeight

                                      &&

                                      set.actualReps
                                  )

                                  .map(
                                    set => ({

                                      id:
                                        Date.now()
                                        + Math.random(),

                                      targetWeight:
                                        set.actualWeight,

                                      targetReps:
                                        set.actualReps

                                    })

                                  )

                            })
                          )

                    }

                    :

                    t

              )

            )



            setSessions(

              sessions.filter(
                s =>

                  s.id !==
                  session.id
              )

            )



            setSelectedSessionId(
              null
            )

          }}

        >

          Complete Workout

        </button>



        </div>

        )

}