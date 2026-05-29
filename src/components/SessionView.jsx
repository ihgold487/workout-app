import { useState, useRef, useEffect } from "react"
import { equipmentOptions } from "../data/seedEquipment"

export default function SessionView({
  session,
  sessions,
  setSessions,
  history,
  setHistory,
  templates,
  setTemplates,
  exerciseLibrary,
  setExerciseLibrary,
  setSelectedSessionId,
  setSelectedTemplateId
}) {

  const [showAddExercise, setShowAddExercise] =
    useState(false)

  const [search, setSearch] = useState("")
  
  const [pendingExercise, setPendingExercise] = useState(null)

  const [newExerciseValues, setNewExerciseValues] =
    useState({
      weight:"",
      reps:"",
      sets:""
    })
  
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
    
    useEffect(() => {

      if (!activeSet) return

      const exercise =
        session.exercises.find(
          ex =>
            ex.id === activeSet.exerciseId
        )

      const setIndex =
        exercise?.sets.findIndex(
          s =>
            s.id === activeSet.setId
        )

      const currentSet =
        exercise?.sets[setIndex]

      const previousSet =
        setIndex > 0
          ? exercise.sets[
              setIndex - 1
            ]
          : null

      if (
        currentSet &&
        !currentSet.actualWeight
      ) {

        updateActual(

          exercise.id,

          currentSet.id,

          "actualWeight",

          previousSet
            ?.actualWeight

            ||

          currentSet.targetWeight

            ||

          ""

        )

      }

    }, [activeSet])
    
    const [expandedNotes, setExpandedNotes] = useState({})

    const [replacingExerciseId, setReplacingExerciseId] = useState(null)
    
    const [confirmComplete, setConfirmComplete] =
      useState(false)
      
    const [showCreateExercise,setShowCreateExercise] = useState(false)
    
    const [newExercise,setNewExercise] = useState({
      name:"",
      muscle:"",
      equipment:""
    })
      
    const [confirmExitWorkout, setConfirmExitWorkout] =
      useState(false)
  
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

    const [timerStartedAt, setTimerStartedAt] =
      useState(null)

    const [restComplete, setRestComplete] =
      useState(false)
    
    useEffect(() => {

      if (
        "Notification" in window
        &&
        Notification.permission
          === "default"
      ) {

        Notification
          .requestPermission()

      }

    }, [])
    
      
    useEffect(() => {

      if (
        !timerRunning ||
        !timerStartedAt
      ) return

      const id =
        setInterval(() => {

          const elapsed =
            Math.floor(
              (Date.now() - timerStartedAt)
              / 1000
            )

          const total =
            restMinutes * 60 +
            restRemainder

          const remaining =
            Math.max(
              total - elapsed,
              0
            )

          setRestSeconds(
            remaining
          )

        }, 1000)

      return () =>
        clearInterval(id)

    }, [
      timerRunning,
      timerStartedAt,
      restMinutes,
      restRemainder
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

            if (
              "Notification" in window
              &&
              Notification.permission
                === "granted"
            ) {

              new Notification(

                "Rest complete",

                {
                  body:
                    "Ready for next set"
                }

              )

            }

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
        lastSet?.actualWeight
        || lastSet?.targetWeight
        || "",
      actualReps:"",

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


  function addExercise(exercise, weight, reps, numSets) {

    const sets = Array.from(
      { length:Number(numSets) },
      () => ({
        id:Date.now()+Math.random(),
        targetWeight:weight,
        targetReps:reps,
        actualWeight:"",
        actualReps:""
      })
    )

    updateSession(
      s => ({
        ...s,
        exercises:[
          ...s.exercises,
          {
            id:Date.now(),
            name:exercise.name,
            equipment:exercise.equipment,
            muscles:exercise.muscles,
            supersetGroup:null,
            sets
          }
        ]
      })
    )

    setPendingExercise(null)
    setShowAddExercise(false)
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

    function hasStructuralChanges() {

      const original =
        templates.find(
          t =>
            t.id === session.templateId
        )

      if (!original)
        return false

      const originalNames =
        original.exercises
          .map(ex => ex.name)

      const sessionNames =
        session.exercises
          .map(ex => ex.name)

      return JSON.stringify(
        originalNames
      ) !== JSON.stringify(
        sessionNames
      )

    }

  return (

    <div style={{
      height:"100vh",
      display:"flex",
      flexDirection:"column",
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
          setConfirmExitWorkout(
            true
          )
        }
      >

        ← End Workout

      </button>

          {confirmExitWorkout && (
            <div style={{
            position:"fixed",
            top:0,left:0,
            width:"100%",
            height:"100%",
            background:"rgba(0,0,0,.45)",
            display:"flex",
            justifyContent:"center",
            alignItems:"center",
            zIndex:9999
            }}>
            
            <div style={{
              background:"#ffe5e5",
              color:"#400",
              border:"2px solid #c66",
              borderRadius:"12px",
              padding:"20px",
              minWidth:"260px",
              boxShadow:"0 0 20px rgba(0,0,0,.35)"
            }}>

              <div style={{
                marginBottom:"12px",
                fontWeight:"bold"
              }}>

                <div style={{
                  display:"flex",
                  alignItems:"center",
                  gap:"8px",
                  fontWeight:"bold",
                  marginBottom:"12px"
                  }}>
                  <span style={{fontSize:"22px"}}>⚠️</span>
                  <span>End Workout?</span>
                </div>

              </div>

              <div style={{
                marginBottom:"16px"
              }}>

                Any entered info will be lost.

              </div>

              <div style={{
                display:"flex",
                justifyContent:"space-between"
              }}>

                <button
                  onClick={() =>
                    setConfirmExitWorkout(
                      false
                    )
                  }
                >
                  ✖️
                </button>

                <button
                  onClick={() => {

                    setConfirmExitWorkout(
                      false
                    )

                    setSelectedSessionId(
                      null
                    )
                    
                    setSelectedTemplateId(
                      null
                    )

                  }}
                >
                  ✔️
                </button>

              </div>
              </div>

            </div>

            )}
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
                    padding:"8px 6px",
                    fontSize:"20px",
                    lineHeight:"1"
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

                      setTimerStartedAt(
                        Date.now()
                        -
                        (
                          (
                            restMinutes * 60 +
                            restRemainder
                          )
                          -
                          restSeconds
                        ) * 1000
                      )

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
                    padding:"8px 6px"
                  }}
                  onClick={() => {
                    setTimerPaused(
                      false
                    )

                    setTimerRunning(
                      false
                    )

                    setTimerStartedAt(
                      null
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
              flex:1,
              overflowY:"auto",
              padding:"20px",
              minHeight:0
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
                            
                            style={{
                              padding:"8px 6px",
                              fontSize:"20px",
                              lineHeight:"1"
                            }}

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
                              ✏️
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
                                    whiteSpace:
                                      "normal",
                                    wordBreak:
                                      "break-word",
                                    lineHeight:
                                      "1.05",
                                    fontSize:
                                      "14px",
                                    textAlign:
                                      "left",
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
                          
                          style={{
                            padding:"8px 6px",
                            fontSize:"20px",
                            lineHeight:"1"
                          }}

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
                                    ex.name === exercise.name
                                )

                              setSelectedMuscle(
                                originalExercise
                                  ?.muscles?.[0]
                                  || ""
                              )

                              setSearch("")

                            }}

                          >

                            🔄

                          </button>

                          {" "}

                          <button

                            style={{
                              padding:"8px 6px",
                              fontSize:"20px",
                              lineHeight:"1"
                            }}

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
                                    padding:"8px 2px",
                                    marginBottom:"6px",
                                    display:"flex",
                                    alignItems:"center",
                                    flexWrap:"nowrap",
                                    width:"calc(100% + 12px)",
                                    marginRight:"-12px",
                                    boxSizing:"border-box",
                                    gap:"4px",

                                    borderLeft:
                                      activeSet?.setId === set.id
                                        ? "4px solid #1976d2"
                                        : "none",
    
                                    background:
                                      activeSet?.setId === set.id
                                        ? "#e3f2fd"
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
                                      width:"72px",
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

                                  onKeyDown={
                                    e => {

                                      if (
                                        e.key === "Enter"
                                      ) {

                                        e.preventDefault()

                                        const row =
                                          e.target.closest(
                                            "[data-set-row]"
                                          )

                                        row
                                          ?.querySelector(
                                            '[data-reps-input]'
                                          )
                                          ?.focus()

                                      }

                                    }
                                  }

                                />

                              ×


                              <input
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  autoComplete="off"

                                  style={{
                                      width:"52px",
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
                                    style={{
                                      padding:"8px 6px",
                                      fontSize:"22px",
                                      lineHeight:"1"
                                    }}

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
                                    style={{
                                      padding:"8px 6px",
                                      fontSize:"20px",
                                      lineHeight:"1"
                                    }}

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

                            [...exercise.sets]

                              .reverse()

                              .find(
                                s =>
                                  s.actualWeight
                                  || s.targetWeight
                              )

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

            {pendingExercise && (

              <div style={{
                position:"fixed",
                top:"50%",
                left:"50%",
                transform:"translate(-50%,-50%)",
                background:"white",
                border:"1px solid #ccc",
                borderRadius:"12px",
                padding:"20px",
                width:"280px",
                zIndex:1000,
                boxShadow:"0 4px 12px rgba(0,0,0,.2)"
              }}>

                <h3>
                  {pendingExercise.name}
                </h3>

                <div style={{
                  display:"flex",
                  alignItems:"center",
                  gap:"10px",
                  marginBottom:"12px"
                }}>
                  🏋️
                  <input
                    type="number"
                    placeholder="Weight"
                    value={newExerciseValues.weight}
                    onChange={e =>
                      setNewExerciseValues({
                        ...newExerciseValues,
                        weight:e.target.value
                      })
                    }
                  />
                </div>

                <div style={{
                  display:"flex",
                  alignItems:"center",
                  gap:"10px",
                  marginBottom:"12px"
                }}>
                  🔁
                  <input
                    type="number"
                    placeholder="Reps"
                    value={newExerciseValues.reps}
                    onChange={e =>
                      setNewExerciseValues({
                        ...newExerciseValues,
                        reps:e.target.value
                      })
                    }
                  />
                </div>

                <div style={{
                  display:"flex",
                  alignItems:"center",
                  gap:"10px",
                  marginBottom:"16px"
                }}>
                  #️⃣
                  <input
                    type="number"
                    placeholder="Sets"
                    value={newExerciseValues.sets}
                    onChange={e =>
                      setNewExerciseValues({
                        ...newExerciseValues,
                        sets:e.target.value
                      })
                    }
                  />
                </div>

                <div style={{
                  display:"flex",
                  justifyContent:"space-between"
                }}>

                  <button
                    onClick={() => {
                      setPendingExercise(null)
                      setShowAddExercise(false)
                    }}
                  >
                    ✖️
                  </button>

                  <button
                    onClick={() =>
                      addExercise(
                        pendingExercise,
                        newExerciseValues.weight,
                        newExerciseValues.reps,
                        newExerciseValues.sets
                      )
                    }
                  >
                    ✔️
                  </button>

                </div>

              </div>

            )}

            {

                      filteredExercises.map(
                        ex => (

                          <button

                            key={
                              `${ex.name}-${
                                ex.equipment?.[0] || ""
                              }-${ex.id}`
                            }

                            onClick={() => {

                              setPendingExercise(ex)

                              setNewExerciseValues({

                                weight:
                                  ex.lastWeight || "",

                                reps:
                                  ex.lastReps || "",

                                sets:""

                              })

                            }}

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


         <>

          <hr style={{
            margin:"16px 0"
          }} />

          <div style={{
            display:"flex",
            justifyContent:"center",
            gap:"12px",
            marginBottom:"12px"
          }}>

          <button
            style={{
              padding:"10px 14px"
            }}
            
            onClick={() =>
              setShowAddExercise(
                !showAddExercise
              )
            }
          >
            {showAddExercise ? "✕ Cancel" : "+ Add Exercise"}
          </button>

          {showAddExercise && (

            <button
              style={{
                padding:"10px 14px"
            }}

              onClick={() =>
                setShowCreateExercise(true)
              }
            >

              + Create Exercise

            </button>

          )}

          <button
            style={{
              padding:"10px 14px"
            }}

            onClick={() =>
              setConfirmComplete(true)
            }
          >

            Complete Workout

          </button>

      </div>
      
      {showCreateExercise && (

        <div style={{
          position:"fixed",
          top:0,
          left:0,
          width:"100%",
          height:"100%",
          background:"rgba(0,0,0,.45)",
          display:"flex",
          justifyContent:"center",
          alignItems:"center",
          zIndex:9999
        }}>

          <div style={{
            background:"white",
            borderRadius:"12px",
            padding:"20px",
            minWidth:"280px",
            boxShadow:"0 0 20px rgba(0,0,0,.35)"
          }}>

           <h3>
              Create Exercise
            </h3>

            <input
              placeholder="Exercise name"
              value={newExercise.name}
              onChange={e =>
                setNewExercise({
                  ...newExercise,
                  name:e.target.value
                })
              }

              style={{
                width:"100%",
                marginTop:"12px",
                padding:"8px",
                boxSizing:"border-box"
              }}
            />

            <select

              value={newExercise.muscle}

              onChange={e =>
                setNewExercise({
                  ...newExercise,
                  muscle:e.target.value
                })
              }

              style={{
                width:"100%",
                marginTop:"12px",
                padding:"8px"
              }}
            >

              <option value="">
                Select muscle
              </option>

              {muscleGroups.map(m => (

                <option
                  key={m}
                  value={m}
                >
                  {m}
                </option>

              ))}

            </select>

            <select
              value={newExercise.equipment}

              onChange={e =>
                setNewExercise({
                  ...newExercise,
                  equipment:e.target.value
                })
              }

              style={{
                width:"100%",
                marginTop:"12px",
                padding:"8px"
              }}
            >

              <option value="">
                Select equipment
              </option>

              {equipmentOptions.map(equipment => (

                <option
                  key={equipment}
                  value={equipment}
                >
                  {equipment}
                </option>

              ))}

            </select>

            <div style={{
              marginTop:"20px",
              display:"flex",
              gap:"8px",
              justifyContent:"flex-end"
            }}>

              <button
                onClick={() =>
                  setShowCreateExercise(false)
                }
              >
                Cancel
              </button>

              <button

                onClick={() => {

                  if (!newExercise.name.trim())
                    return

                  const createdExercise = {

                    id:Date.now(),

                    name:newExercise.name.trim(),

                    muscles:[
                      newExercise.muscle
                    ],

                    equipment:[
                      newExercise.equipment
                    ]

                  }

                  setExerciseLibrary([
                    ...exerciseLibrary,
                    createdExercise
                  ])

                  setPendingExercise(
                    createdExercise
                  )

                  setShowCreateExercise(false)

                  setNewExercise({
                    name:"",
                    muscle:"",
                    equipment:""
                  })

                }}

              >

                Save

              </button>

            </div>

          </div>

        </div>

      )}

      {confirmComplete && (
        <div style={{
        position:"fixed",
        top:0,left:0,
        width:"100%",
        height:"100%",
        background:"rgba(0,0,0,.45)",
        display:"flex",
        justifyContent:"center",
        alignItems:"center",
        zIndex:9999
        }}>
        
        <div style={{
          background:"#e6f7ea",
          color:"#153a1f",
          border:"2px solid #5aa469",
          borderRadius:"12px",
          padding:"20px",
          minWidth:"260px",
          boxShadow:"0 0 20px rgba(0,0,0,.35)"
        }}>

        <div style={{
          marginBottom:"16px"
        }}>
        <div style={{
          display:"flex",
          flexDirection:"column",
          alignItems:"center",
          fontWeight:"bold",
          marginBottom:"16px"
          }}>
          <div style={{
            fontSize:"56px",
            marginBottom:"24px"
            }}>
            💪
          </div>
          <div>Complete Workout?</div>
          </div>
        </div>

        <div style={{
          display:"flex",
          justifyContent:"space-between"
        }}>

          <button
            onClick={() =>
              setConfirmComplete(false)
            }
          >
            ✖️
          </button>

          <button
            onClick={() => {

              let completedWorkout = {
                ...session,
                completedAt:
                  new Date()
                    .toLocaleDateString()
              }

              if (hasStructuralChanges()) {

                const original =
                  templates.find(
                    t =>
                      t.id === session.templateId
                  )

                const derived = {

                  ...original,

                  id:Date.now(),

                  name:
                    `${original.name} (modified)`,

                  parentTemplateId:
                    original.id,

                  exercises:
                    session.exercises.map(
                      ex => ({
                        ...ex,
                        sets:
                          ex.sets
                            .filter(
                              set =>
                                set.actualWeight &&
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

                completedWorkout = {

                  ...completedWorkout,

                  templateId:
                    derived.id,

                  templateName:
                    derived.name

                }

                setTemplates([
                  ...templates,
                  derived
                ])

              }

              setHistory([
                completedWorkout,
                ...history
              ])

              if (!hasStructuralChanges()) {

                setTemplates(

                  templates.map(
                    t =>

                      t.id === session.templateId

                        ?

                        {

                          ...t,

                          lastCompleted:
                            completedWorkout.completedAt,

                          exercises:
                            session.exercises.map(
                              ex => ({
                                ...ex,

                                sets:
                                  ex.sets
                                    .filter(
                                      set =>
                                        set.actualWeight &&
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

              }

              setSessions(
                sessions.filter(
                  s =>
                    s.id !== session.id
                )
              )

              setSelectedSessionId(null)

              setSelectedTemplateId(null)

            }}
          >
            ✔️
          </button>

        </div>

      </div>
      </div>

      )}

      </>

      </div>

      </div>

      )

      }