import { useState, useRef, useEffect } from "react"

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
  
  const [activeSet, setActiveSet] =
    useState(

      {

        exerciseId:

          session.exercises[0]
            ?.id,

        setId:

          session.exercises[0]
            ?.sets[0]
            ?.id

      }

    )
    
    const inputRefs = useRef({})
  
    const [restMinutes, setRestMinutes] =
        useState(2)

    const [restRemainder, setRestRemainder] =
      useState(0)
    
    const [restSeconds, setRestSeconds] =
      useState(120)

    const [timerRunning, setTimerRunning] =
      useState(false)
      
    useEffect(() => {

          if (
            !timerRunning ||
            restSeconds <= 0
          ) return

          const id =
            setTimeout(
              () =>
                setRestSeconds(
                  s => s - 1
                ),
              1000
            )

          return () =>
            clearTimeout(id)

        }, [
          timerRunning,
          restSeconds
        ])

        useEffect(() => {

          if (
            restSeconds === 0 &&
            timerRunning
          ) {

            alert(
              "Rest complete"
            )

            setTimerRunning(
              false
            )

          }

        }, [
          restSeconds,
          timerRunning
        ])

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
        "",

      completed:
        false

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

    function markSetComplete(exerciseId, setId) {
      const exercise =
        session.exercises.find(
          ex => ex.id === exerciseId
        )

      const currentSet =
        exercise.sets.find(
          s => s.id === setId
        )

      const currentIndex =
        exercise.sets.findIndex(
          s => s.id === setId
        )

      const undo =
        currentSet.completed

      updateSession(s => ({
        ...s,
        exercises: s.exercises.map(ex =>
          ex.id === exerciseId
            ? {
                ...ex,
                sets: ex.sets.map(set =>
                  set.id === setId
                    ? {
                        ...set,
                        completed: !undo,
                        actualWeight:
                          undo ? "" : set.actualWeight,
                        actualReps:
                          undo ? "" : set.actualReps
                      }
                    : set
                )
              }
            : ex
        )
      }))

      if (undo) {
        setActiveSet({ exerciseId, setId })
        return
      }

      const group =
        exercise.supersetGroup

      if (group) {

          const superset =
            session.exercises.filter(
              ex =>
                ex.supersetGroup === group
            )

          const currentSupersetIndex =
            superset.findIndex(
              ex =>
                ex.id === exerciseId
            )

          const nextExercise =
            superset[
              currentSupersetIndex + 1
            ]

          if (
            nextExercise &&
            nextExercise.sets[currentIndex]
          ) {

            setActiveSet({
              exerciseId:
                nextExercise.id,

              setId:
                nextExercise
                  .sets[currentIndex]
                  .id
            })

            return
          }

          const firstExercise =
            superset[0]

          if (
            firstExercise &&
            firstExercise.sets[
              currentIndex + 1
            ]
          ) {

            setActiveSet({
              exerciseId:
                firstExercise.id,

              setId:
                firstExercise
                  .sets[currentIndex + 1]
                  .id
            })

            return
          }

        }

      const nextSet =
        exercise.sets[
          currentIndex + 1
        ]

      if (nextSet) {

        setActiveSet({
          exerciseId,
          setId:
            nextSet.id
        })

        return
      }

      const exerciseIndex =
        session.exercises.findIndex(
          ex =>
            ex.id === exerciseId
        )

      const nextExercise =
        session.exercises[
          exerciseIndex + 1
        ]

      if (
        nextExercise &&
        nextExercise.sets[0]
      ) {

        setActiveSet({
          exerciseId:
            nextExercise.id,

          setId:
            nextExercise.sets[0].id
        })

      }
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
    
    const muscleGroups =

  [

    ...new Set(

      exerciseLibrary.map(
        e =>

          e.muscleGroup
      )

    )

  ]


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

        <div style={{
          border: "1px solid #ccc",
          padding: "10px",
          marginTop: "10px",
          marginBottom: "20px"
        }}>

          <h3>Rest Timer</h3>
          <div style={{
              marginBottom: "10px"
            }}>

              <select
                value={restMinutes}
                onChange={e =>
                  setRestMinutes(
                    Number(
                      e.target.value
                    )
                  )
                }
              >

                {[0,1,2,3,4,5].map(
                  n =>

                    <option
                      key={n}
                      value={n}
                    >

                      {n}

                    </option>
                )}

              </select>

              <select
                value={restRemainder}
                onChange={e =>
                  setRestRemainder(
                    Number(
                      e.target.value
                    )
                  )
                }
              >

                {[0,15,30,45].map(
                  n =>

                    <option
                      key={n}
                      value={n}
                    >

                      {
                        String(n)
                          .padStart(
                            2,
                            "0"
                          )
                      }

                    </option>
                )}

              </select>

            </div>

          <div style={{
            fontSize: "2rem",
            marginBottom: "10px"
          }}>
            {String(
              Math.floor(restSeconds / 60)
            ).padStart(2, "0")}
            :
            {String(
              restSeconds % 60
            ).padStart(2, "0")}
          </div>

          <button
              onClick={() => {

                setRestSeconds(
                  restMinutes * 60 +
                  restRemainder
                )

                setTimerRunning(true)

              }}
            >
              Start
            </button>

          <button
            onClick={() =>
              setTimerRunning(false)
            }
          >
            Pause
          </button>

          <button
            onClick={() => {
              setTimerRunning(false)
              setRestSeconds(restMinutes * 60 + restRemainder)
            }}
          >
            Reset
          </button>

        </div>

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
                  group.group && (
                    <h2>
                      ==== Set {group.group} ====
                    </h2>
                  )
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

                                      onClick={() => {

                                          const blocked =

                                            exercise.sets

                                              .slice(

                                                0,

                                                exercise.sets.findIndex(
                                                  s =>
                                                    s.id ===
                                                    set.id
                                                )

                                              )

                                              .some(
                                                s =>
                                                  !s.completed
                                              )


                                          if (!blocked) {

                                            setActiveSet({

                                              exerciseId:
                                                exercise.id,

                                              setId:
                                                set.id

                                            })

                                          }

                                        }}
                                    
                                  style={{

                                    padding:
                                      "6px",

                                    marginBottom:
                                      "4px",

                                borderLeft:

                                  activeSet
                                    ?.setId

                                  ===

                                  set.id

                                    ?

                                    "4px solid #444"

                                    :

                                    "none",
                                    
                                background:

                                  activeSet
                                    ?.setId

                                  ===

                                  set.id

                                    ?

                                    "#f3f3f3"

                                    :

                                    "transparent",
                                      
                                   fontWeight:

                                      activeSet
                                        ?.setId

                                      ===

                                      set.id

                                        ?

                                        "bold"

                                        :

                                        "normal",
                                  }}

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

                                  ref={el => {

                                    if (!el) return

                                    inputRefs.current[
                                      set.id
                                    ] = el


                                    if (

                                      activeSet?.setId

                                      ===

                                      set.id

                                    ) {

                                      setTimeout(
                                        () =>
                                          el.focus(),
                                        0
                                      )

                                    }

                                  }}

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
                                  disabled={
                                    set.completed
                                      ? exercise.sets
                                          .slice(
                                            exercise.sets.findIndex(
                                              s => s.id === set.id
                                            ) + 1
                                          )
                                          .some(
                                            s => s.completed
                                          )
                                      : activeSet?.setId !== set.id
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    markSetComplete(
                                      exercise.id,
                                      set.id
                                    )
                                  }}
                                >
                                  {set.completed ? "✓" : "○"}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteSet(
                                      exercise.id,
                                      set.id
                                    )
                                  }}
                                >
                                  Delete
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