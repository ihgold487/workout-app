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
    
    const [expandedNotes, setExpandedNotes] = useState({})

    const [replacingExerciseId, setReplacingExerciseId] = useState(null)
  
    const [restMinutes, setRestMinutes] =
        useState(2)

    const [restRemainder, setRestRemainder] =
      useState(0)
    
    const [restSeconds, setRestSeconds] =
      useState(120)

    const [timerRunning, setTimerRunning] =
      useState(false)
      
    const [timerPaused, setTimerPaused] = 
      useState(false)
      
    const [restComplete, setRestComplete] = 
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
                !timerRunning &&
                !timerPaused
              )

                setRestSeconds(
                  restMinutes * 60 +
                  restRemainder
                )

            }, [
              restMinutes,
              restRemainder,
              timerRunning,
              timerPaused
            ])

            useEffect(() => {

              if (
                restSeconds === 0 &&
            timerRunning
          ) {

            navigator.vibrate?.(
              [200,100,200]
            )

            try {

              const ctx =
                new (
                  window.AudioContext
                  ||
                  window.webkitAudioContext
                )()

              const osc =
                ctx.createOscillator()

              osc.connect(
                ctx.destination
              )

              osc.frequency.value =
                1000

              osc.start()

              setTimeout(
                () => {

                  osc.stop()
                  ctx.close()

                },

                200
              )

            }

            catch {}
            
            setRestComplete(
            true
          )

          setTimeout(
            () =>
              setRestComplete(
                false
              ),
            2000
          )

            setTimerRunning(
              false
            )

            setRestSeconds(

              restMinutes * 60 +

              restRemainder

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

    function replaceExercise(
      oldExerciseId,
      newExercise
    ) {

      updateSession(

        s => ({

          ...s,

          templateChanged:
            true,

          exercises:

            s.exercises.map(
              ex =>

                ex.id ===
                oldExerciseId

                  ?

                  {
                    ...ex,

                    name:
                      newExercise.name,

                    equipment:
                      newExercise.equipment,

                    muscles:
                      newExercise.muscles,

                    originalExerciseId:
                      newExercise.id
                  }

                  :

                  ex
            )

        })

      )

      if (

              activeSet
                ?.exerciseId

              ===

              oldExerciseId

            ) {

              setActiveSet(
                s => ({
                  ...s,

                  exerciseId:
                    oldExerciseId
                })
              )

            }

            setReplacingExerciseId(
              null
            )

            setSearch("")

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

            equipment:
              exercise.equipment,

            muscles:
              exercise.muscles,

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
                .muscles?.[0]

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
    
  // UNIQUE muscle filter options
  const muscleGroups =
    [...new Set(
      exerciseLibrary.map(
        e => e.muscles?.[0]
      )
    )]
    .filter(Boolean)
    .sort()

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
      height:"100vh",
      overflow:"hidden"
    }}>

    <div
      style={{
        position:"sticky",
        top:0,
        background:"white",
        zIndex:10,
        padding:"20px",
        borderBottom:
          "1px solid #ddd"
      }}
    >

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
                  border:"1px solid #ccc",
                  padding:"6px",
                  marginTop:"10px",
                  marginBottom:"12px",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  gap:"8px",
                  flexWrap:"nowrap"
                }}>

                <span style={{
                  fontSize:"28px"
                }}>
                  ⏱
                </span>

                <select
                  style={{
                    fontSize:"16px",
                    padding:"4px"
                  }}
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
                    n => (
                      <option
                        key={n}
                        value={n}
                      >
                        {n}
                      </option>
                    )
                  )}
                </select>

                <select
                  style={{
                    fontSize:"16px",
                    padding:"4px"
                  }}
                  value={restRemainder}
                  onChange={e =>
                    setRestRemainder(
                      Number(
                        e.target.value
                      )
                    )
                  }
                >
                  {[0,5,15,30,45].map(
                    n => (
                      <option
                        key={n}
                        value={n}
                      >
                        {
                          String(n)
                            .padStart(2,"0")
                        }
                      </option>
                    )
                  )}
                </select>

                <strong style={{
                  fontSize:"20px",
                  minWidth:"55px"
                }}>

                {String(
                  Math.floor(
                    restSeconds / 60
                  )
                ).padStart(2,"0")}

                :

                {String(
                  restSeconds % 60
                ).padStart(2,"0")}

                </strong>

                <button
                  style={{
                    fontSize:"18px",
                    padding:"4px 8px"
                  }}
                  onClick={() => {

                    if (timerRunning) {
                      setTimerPaused(
                        true
                      )

                      setTimerRunning(
                        false
                      )

                    } else {

                      setTimerPaused(
                        false
                      )

                      if (
                        restSeconds <= 0
                      ) {

                        setRestSeconds(
                          restMinutes * 60 +
                          restRemainder
                        )

                      }

                      setTimerRunning(
                        true
                      )

                    }

                  }}
                >

                {
                  timerRunning
                    ? "■"
                    : "▶"
                }

                </button>

                <button
                  style={{
                    fontSize:"18px",
                    padding:"4px 8px"
                  }}
                  onClick={() => {
                    setTimerPaused(
                      false
                    )

                    setTimerRunning(
                      false
                    )

                    setRestSeconds(
                      restMinutes * 60 +
                      restRemainder
                    )

                  }}
                >

                ↺

                </button>

          </div>

          </div>

          <div
            style={{
              height:
                "calc(100vh - 120px)",
              overflowY:
                "auto",
              padding:
                "20px"
            }}
          >

          {

            restComplete &&

            <div
              style={{
                marginBottom:"10px",
                padding:"10px",
                textAlign:"center",
                fontWeight:"bold",
                border:"1px solid",
                borderRadius:"8px"
              }}
            >

              REST COMPLETE

            </div>

          }

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

                  key={
                    `${ex.name}-${
                      ex.equipment?.[0] || ""
                    }-${ex.id}`
                  }

                  onClick={() =>
                    addExercise(ex)
                  }

                >

                  {
                    `${ex.name}${
                      ex.equipment?.[0]
                        ? ", " + ex.equipment[0]
                        : ""
                    }`
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
                  "8px",

                borderRadius:
                  "8px"

              }}

            >

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

                      <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>

                          <div>

                            <button
                              onClick={() =>
                                setExpandedNotes(
                                  s => ({
                                    ...s,
                                    [exercise.id]:
                                      !s[exercise.id]
                                  })
                                )
                              }
                            >
                              📝
                            </button>

                            {" "}

                            <strong>
                              <span

                                  onClick={() =>

                                    alert(

                                      `${exercise.name}${
                                        exercise.equipment?.[0]
                                          ? ", " + exercise.equipment[0]
                                          : ""
                                      }`
                                    )

                                  }

                                  style={{

                                    display:
                                      "inline-block",

                                    maxWidth:
                                      "180px",

                                    overflow:
                                      "hidden",

                                    textOverflow:
                                      "ellipsis",

                                    whiteSpace:
                                      "nowrap",

                                    verticalAlign:
                                      "middle",

                                    cursor:
                                      "pointer"
                                  }}

                                >

                                  {
                                    `${exercise.name}${
                                      exercise.equipment?.[0]
                                        ? ", " + exercise.equipment[0]
                                        : ""
                                    }`
                                  }

                                </span>
                            </strong>

                          </div>


                          <div>

                          <button

                            onClick={() => {

                              setReplacingExerciseId(

                                replacingExerciseId ===
                                exercise.id

                                  ?

                                  null

                                  :

                                  exercise.id

                              )

                              const originalExercise =

                                exerciseLibrary.find(
                                  ex =>

                                    ex.name ===
                                    exercise.name
                                )

                              setSelectedMuscle(

                                originalExercise
                                  ?.muscleGroup

                                  ||

                                  ""

                              )

                              setSearch("")

                            }}

                          >

                            🔄

                          </button>

                          {" "}

                          <button

                            onClick={() =>

                              deleteExercise(
                                exercise.id
                              )

                            }

                          >

                            🗑

                          </button>

                        </div>
                        </div>
                      
                        {
                          (

                            expandedNotes[
                              exercise.id
                            ]

                            ||

                            exercise.note?.trim()

                          )

                          &&

                            <div style={{
                              display: "flex",
                              gap: "4px"
                            }}>

                            <input

                                  placeholder="Notes"

                                  style={{
                                    width:"100%",
                                    height:"20px",
                                    fontSize:"0.85rem",
                                    padding:"2px"
                                  }}

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

                                 />

                            <button

                              onClick={() => {

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

                                            note: ""

                                          }

                                          :

                                          ex
                                      )

                                  })

                                )

                                setExpandedNotes(
                                  notes => ({
                                    ...notes,

                                    [exercise.id]:
                                      false
                                  })
                                )

                              }}

                            >

                            ✕

                            </button>

                        </div>
                        }

                        {

                          replacingExerciseId ===
                          exercise.id

                          &&

                          <div style={{
                              marginTop:"6px",
                              padding:"6px",
                              border:"1px solid #ccc",
                              background:"#f8f8f8",
                              display:"flex",
                              flexDirection:"column",
                              gap:"4px"
                            }}>
                            <div style={{
                              display:"flex",
                              justifyContent:"flex-start",
                              marginBottom:"2px"
                            }}>

                            <button
                              onClick={() => {
                                setReplacingExerciseId(
                                  null
                                )
                                setSearch("")
                              }}
                            >

                            ✕

                            </button>

                            </div>

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

                            <input

                              placeholder=
                                "Search exercise"

                              value={search}

                              onChange={
                                e =>

                                  setSearch(
                                    e.target.value
                                  )
                              }

                                />

                                {

                                  exerciseLibrary

                                    .filter(
                                      ex =>

                                        !selectedMuscle

                                        ||

                                        ex.muscles?.[0] ===
                                        selectedMuscle
                                    )

                                    .filter(
                                      ex =>

                                        ex.name
                                          .toLowerCase()

                                          .includes(
                                            search
                                              .toLowerCase()
                                          )
                                    )

                                    .map(
                                      ex => (
                                  <button

                                    key={
                                      `${ex.name}-${
                                        ex.equipment?.[0] || ""
                                      }-${ex.id}`
                                    }

                                    onClick={() =>

                                      replaceExercise(
                                        exercise.id,
                                        ex
                                      )

                                    }

                                  >

                                    {
                                      `${ex.name}${
                                        ex.equipment?.[0]
                                          ? ", " + ex.equipment[0]
                                          : ""
                                      }`
                                    }

                                  </button>

                                )
                              )

                            }

                          </div>

                        }
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
                                    padding:"6px",
                                    marginBottom:"4px",

                                    display:"flex",
                                    alignItems:"center",
                                    flexWrap:"nowrap",

                                    borderLeft:
                                      activeSet?.setId === set.id
                                        ? "4px solid green"
                                        : "none",

                                    borderRight:
                                      activeSet?.setId === set.id
                                        ? "4px solid green"
                                        : "none",

                                    background:
                                      activeSet?.setId === set.id
                                        ? "#e8f5e9"
                                        : "transparent",

                                    fontWeight:
                                      activeSet?.setId === set.id
                                        ? "bold"
                                        : "normal"
                                  }}
                                >

                             <span style={{whiteSpace:"nowrap"}}>

                                🎯

                                {
                                  set.targetWeight
                                }

                                ×

                                {
                                  set.targetReps
                                }

                                {" | "}

                              </span>

                                <span
                                  style={{
                                    display:"inline-flex",
                                    alignItems:"center",
                                    whiteSpace:"nowrap"
                                  }}
                                >

                                ✍️

                                <input
                                  ref={el => {

                                    if (!el) return

                                    inputRefs.current[
                                      set.id
                                    ] = el

                                  }}

                                  inputMode="decimal"
                                  pattern="[0-9.]*"
                                  autoComplete="off"

                                  style={{
                                      width:"48px",
                                      marginLeft:"4px",
                                      fontSize:"16px",
                                      border:"1px solid #ccc",
                                      outline:"none",
                                      boxSizing:"border-box"
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
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  autoComplete="off"

                                  style={{
                                      width:"36px",
                                      marginLeft:"6px",
                                      fontSize:"16px",
                                      border:"1px solid #ccc",
                                      outline:"none",
                                      boxSizing:"border-box"
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
                                  </span>
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
                                  🗑
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

        </div>

        )

}