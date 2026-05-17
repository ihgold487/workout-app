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

  const [showAddExercise,
    setShowAddExercise] =
    useState(false)

  const [search,
    setSearch] =
    useState("")



  function updateSession(
    updater
  ) {

    setSessions(

      sessions.map(
        s =>

          s.id === session.id

            ?

            updater(s)

            :

            s
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

      session => ({

        ...session,

        exercises:

          session.exercises.map(
            ex =>

              ex.id === exerciseId

                ?

                {

                  ...ex,

                  sets:

                    ex.sets.map(
                      set =>

                        set.id === setId

                          ?

                          {
                            ...set,
                            [field]:
                              value
                          }

                          :

                          set
                    )

                }

                :

                ex
          )

      })

    )

  }



  function deleteSet(
    exerciseId,
    setId
  ) {

    updateSession(

      session => ({

        ...session,

        exercises:

          session.exercises.map(
            ex =>

              ex.id === exerciseId

                ?

                {

                  ...ex,

                  sets:

                    ex.sets.filter(
                      set =>
                        set.id !==
                        setId
                    )

                }

                :

                ex
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

      session => ({

        ...session,

        exercises:

          session.exercises.map(
            ex =>

              ex.id === exerciseId

                ?

                {

                  ...ex,

                  sets: [
                    ...ex.sets,
                    newSet
                  ]

                }

                :

                ex
          )

      })

    )

  }



  function deleteExercise(
    exerciseId
  ) {

    updateSession(

      session => ({

        ...session,

        exercises:

          session.exercises.filter(
            ex =>
              ex.id !==
              exerciseId
          )

      })

    )

  }



  function addExercise(
    exercise
  ) {

    const weight =
      prompt(
        "Target weight"
      )

    const reps =
      prompt(
        "Target reps"
      )

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

      session => ({

        ...session,

        exercises: [

          ...session.exercises,

          {

            id:
              Date.now(),

            name:
              exercise.name,

            sets

          }

        ]

      })

    )


    setSearch("")
    setShowAddExercise(false)

  }



  const filteredExercises =
    exerciseLibrary.filter(
      ex =>

        ex.name
        .toLowerCase()

        .includes(
          search
          .toLowerCase()
        )
    )



  return (

    <div style={{
      padding:"20px"
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

        <div
          style={{
            marginTop:
              "15px"
          }}
        >

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

                <div
                  key={ex.id}
                >

                  <button

                    onClick={() =>
                      addExercise(
                        ex
                      )
                    }

                  >

                    {
                      ex.name
                    }

                  </button>

                </div>

              ))

          }

        </div>

      }



      <hr />



      {

        session.exercises.map(
          exercise => (

            <div
              key={
                exercise.id
              }

              style={{
                marginBottom:
                  "30px"
              }}
            >

            <h3>

              {
                exercise.name
              }


              {" "}


              <button

                onClick={() => {

                  const index =

                    session.exercises.findIndex(
                      ex =>

                        ex.id ===
                        exercise.id
                    )


                  if (
                    index <= 0
                  )
                  return


                  const reordered =
                    [...session.exercises]


                  ;[
                    reordered[index - 1],
                    reordered[index]
                  ] = [

                    reordered[index],
                    reordered[index - 1]

                  ]


                  updateSession(

                    s => ({

                      ...s,

                      exercises:
                        reordered

                    })

                  )

                }}

              >

                ↑

              </button>



              <button

                onClick={() => {

                  const index =

                    session.exercises.findIndex(
                      ex =>

                        ex.id ===
                        exercise.id
                    )


                  if (

                    index >=

                    session.exercises
                    .length - 1

                  )

                  return


                  const reordered =
                    [...session.exercises]


                  ;[
                    reordered[index + 1],
                    reordered[index]
                  ] = [

                    reordered[index],
                    reordered[index + 1]

                  ]


                  updateSession(

                    s => ({

                      ...s,

                      exercises:
                        reordered

                    })

                  )

                }}

              >

                ↓

              </button>



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
                      exercise.sets.length
                      - 1
                    ]

                  )

                }

              >

                + Add Set

              </button>

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