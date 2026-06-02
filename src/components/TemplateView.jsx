import { useState } from "react"

export default function TemplateView({
  template,
  templates,
  setTemplates,
  exerciseLibrary,
  sessions,
  setSessions,
  setSelectedSessionId,
  setSelectedTemplateId
}) {

  const [search, setSearch] =
    useState("")
    
    const [selectedMuscle, setSelectedMuscle] =
     useState("")

    const [showAdd, setShowAdd] =
      useState(false)

    const [
      pendingExercise,
      setPendingExercise
    ] =
    useState(null)

    const [
      newExerciseValues,
      setNewExerciseValues
    ] =
    useState({

      weight:"",
      reps:"",
      sets:"",
      rir:""

    })

    // ACTION BUTTONS: keep icon sizes consistent app-wide
    const iconButton = {
      fontSize: "0.9rem",
      padding: "1px 4px"
    }

  function startWorkout() {

    const session = {

      id:
        Date.now(),

      templateId:
        template.id,

      templateName:
        template.name,

      exercises:

        template.exercises.map(
          exercise => ({

            ...exercise,

            sets:

              exercise.sets.map(
                set => ({

                  ...set,

                  actualWeight:
                    "",

                  actualReps:
                    "",

                  targetRir:
                   set.targetRir || set.rir || "",

                  actualRir:
                    ""

                })

              )

          })

        )

    }


    setSessions([
      ...sessions,
      session
    ])


    setSelectedSessionId(
      session.id
    )

  }



  function addExercise(
    exercise
  ) {

        const weight =
          newExerciseValues.weight

        const reps =
          newExerciseValues.reps

        const numSets =
          Number(
            newExerciseValues.sets
          )
          
        const rir =
          newExerciseValues.rir


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

          targetRir:
            rir

        })

      )



    setTemplates(

      templates.map(
        t =>

          t.id ===
          template.id

            ?

            {

              ...t,

              exercises: [

                ...t.exercises,

                {

                  id:
                    Date.now(),

                  name:
                    exercise.name,

                  equipment:
                    exercise.equipment,

                  muscles:
                    exercise.muscles,

                  sets

                }

              ]

            }

            :

            t

      )

    )


    setShowAdd(
      false
    )

    setSearch("")

    setPendingExercise(null)

      setNewExerciseValues({
        weight:"",
        reps:"",
        sets:""
      })

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
            search.toLowerCase()
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
            e => e.muscles?.[0]
          )

        )

      ]

  return (

    <div
      style={{
        padding:
          "20px"
      }}
    >

      <button
        onClick={() =>
          setSelectedTemplateId(
            null
          )
        }
      >

        ← Back

      </button>



      <input

          style={{
            fontSize:
              "2rem",

            marginBottom:
              "20px",

            width:
              "100%"
          }}

          value={
            template.name
          }

          onChange={
            e =>

              setTemplates(

                templates.map(
                  t =>

                    t.id ===
                    template.id

                      ?

                      {

                        ...t,

                        name:
                          e.target.value

                      }

                      :

                      t

                )

              )
          }

        />



      <button
        onClick={
          startWorkout
        }
      >

        Start Workout

      </button>


      {" "}


      <button
        onClick={() =>
          setShowAdd(
            !showAdd
          )
        }
      >

        + Add Exercise

      </button>



{
showAdd && (

<div
  style={{
    marginTop: "20px",
    border: "1px solid #ccc",
    padding: "10px"
  }}
>

  <div>

    <select
      value={selectedMuscle}
      onChange={e =>
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

  </div>


  <input

    placeholder=
      "Search exercise"

    value={search}

    onChange={e =>
      setSearch(
        e.target.value
      )
    }

  />


  {
    filteredExercises.map(
      exercise => (

        <div
          key={`${exercise.name}-${exercise.equipment?.[0] || ""}-${exercise.id}`}

          style={{
            marginTop:
              "10px"
          }}
        >

          <button
            onClick={() =>
              setPendingExercise(
                exercise
              )
            }
          >

            {
              `${exercise.name}${
                exercise.equipment?.[0]
                  ? ", " + exercise.equipment[0]
                  : ""
              }`
            }

          </button>

        </div>

      )
    )
  }


  {
    pendingExercise && (

      <div
        style={{

          position:
            "fixed",

          top:
            "50%",

          left:
            "50%",

          transform:
            "translate(-50%, -50%)",

          background:
            "white",

          border:
            "1px solid #ccc",

          borderRadius:
            "12px",

          padding:
            "20px",

          width:
            "280px",

          zIndex:
            "1000",

          boxShadow:
            "0 4px 12px rgba(0,0,0,.2)"

        }}
      >

        <h3>
          {
            `${pendingExercise.name}${
              pendingExercise.equipment?.[0]
                ? ", " + pendingExercise.equipment[0]
                : ""
            }`
          }

        </h3>


        <div
          style={{
            display:"flex",
            alignItems:"center",
            gap:"10px",
            marginBottom:"12px"
          }}
        >

          <span
            style={{
              fontSize:"28px"
            }}
          >

            🏋️

          </span>

          <input
            type="number"
            inputMode="decimal"

            placeholder="Weight"

            style={{
              width:"70px",
              fontSize:"20px",
              padding:"10px"
            }}

            value={
              newExerciseValues.weight
            }

            onChange={e =>
              setNewExerciseValues(
                v => ({
                  ...v,
                  weight:
                    e.target.value
                })
              )
            }
          />

        </div>


        <div
              style={{
                display:"flex",
                alignItems:"center",
                gap:"10px",
                marginBottom:"12px"
              }}
            >

              <span
                style={{
                  fontSize:"28px"
                }}
              >

                🔁

              </span>

              <input
                type="number"
                inputMode="numeric"

                placeholder="Reps"

                style={{
                  width:"70px",
                  fontSize:"20px",
                  padding:"10px"
                }}

                value={
                  newExerciseValues.reps
                }

                onChange={e =>
                  setNewExerciseValues(
                    v => ({
                      ...v,
                      reps:
                        e.target.value
                    })
                  )
                }
              />

            </div>


       <div
              style={{
                display:"flex",
                alignItems:"center",
                gap:"10px",
                marginBottom:"12px"
              }}
            >

              <span
                style={{
                  fontSize:"28px"
                }}
              >

                🔢 

              </span>

              <input
                type="number"
                inputMode="numeric"

                placeholder="Sets"

                style={{
                  width:"70px",
                  fontSize:"20px",
                  padding:"10px"
                }}

                value={
                  newExerciseValues.sets
                }

                onChange={e =>
                  setNewExerciseValues(
                    v => ({
                      ...v,
                      sets:
                        e.target.value
                    })
                  )
                }
              />

            </div>
            
            <div
              style={{
                display:"flex",
                alignItems:"center",
                gap:"10px",
                marginBottom:"12px"
              }}
            >

              <span
                style={{
                  fontSize:"28px"
                }}
              >
                🔋
              </span>

              <input
                type="number"
                inputMode="decimal"

                placeholder="RIR"

                style={{
                  width:"70px",
                  fontSize:"20px",
                  padding:"10px"
                }}

                value={
                  newExerciseValues.rir || ""
                }

                onChange={e =>
                  setNewExerciseValues(
                    v => ({
                      ...v,
                      rir:e.target.value
                    })
                  )
                }
              />

            </div>


        <div
          style={{
            marginTop:
              "12px",

            display:
              "flex",

            gap:
              "10px",

            justifyContent:
              "flex-end"
          }}
        >

          <button

              style={{
                fontSize:"28px",
                padding:"8px 18px",
                minWidth:"56px"
              }}

              onClick={() => {

                setPendingExercise(
                  null
                )

                setNewExerciseValues({

                  weight:"",
                  reps:"",
                  sets:""

                })

              }}
            >

              ✕

            </button>


          <button

              style={{
                fontSize:"28px",
                padding:"8px 18px",
                minWidth:"56px"
              }}

              onClick={() => {

                addExercise(
                  pendingExercise
                )

                setNewExerciseValues({

                  weight:"",
                  reps:"",
                  sets:""

                })

              }}
            >

              ✓

            </button>

        </div>

      </div>

    )
  }

</div>

)
}
      <hr />



      {

        template.exercises.map(
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

             <h3
                  style={{
                    display:"flex",
                    alignItems:"center",
                    width:"100%",
                    fontSize:"0.85rem"
                  }}
                >

                <div
                  style={{
                    display:"flex",
                    alignItems:"center",
                    flex:1,
                    gap:"4px"
                  }}
                >

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

                    flex:
                      1,

                    minWidth:
                      0,

                    overflowWrap:
                      "break-word",

                    cursor:
                      "pointer"

                  }}

                >

                <button
                  style={iconButton}
                  onClick={() => {

                    const note =
                      prompt(
                        "Exercise note",
                        exercise.note || ""
                      )

                    if (note === null)
                      return

                    setTemplates(

                      templates.map(
                        t =>

                          t.id === template.id

                            ? {
                                ...t,
                                exercises:
                                  t.exercises.map(
                                    ex =>

                                      ex.id ===
                                      exercise.id

                                        ? {
                                            ...ex,
                                            note
                                          }

                                        : ex
                                  )
                              }

                            : t
                      )

                    )

                  }}

                >

                ✏️

                </button>

                {
                  `${exercise.name}${
                    exercise.equipment?.[0]
                      ? ", " + exercise.equipment[0]
                      : ""
                  }`
                }
                
                </span>

                </div>

                <div
                  style={{
                    display:"flex",
                    gap:"2px",
                    marginLeft:"auto"
                  }}
                >

                <button
                    style={iconButton}

                  onClick={() => {

                    const index =
                      template.exercises.findIndex(
                        ex =>
                          ex.id ===
                          exercise.id
                      )

                    if (index <= 0)
                      return


                    const reordered =
                      [...template.exercises]


                    ;[
                      reordered[index - 1],
                      reordered[index]

                    ] = [

                      reordered[index],
                      reordered[index - 1]

                    ]


                    setTemplates(

                      templates.map(
                        t =>

                          t.id ===
                          template.id

                            ?

                            {

                              ...t,

                              exercises:
                                reordered

                            }

                            :

                            t

                      )

                    )

                  }}
                >

                  ⬆️

                </button>



                <button
                    style={iconButton}

                  onClick={() => {

                    const index =
                      template.exercises.findIndex(
                        ex =>
                          ex.id ===
                          exercise.id
                      )


                    if (

                      index >=

                      template.exercises
                      .length - 1

                    )

                      return


                    const reordered =
                      [...template.exercises]


                    ;[
                      reordered[index + 1],
                      reordered[index]

                    ] = [

                      reordered[index],
                      reordered[index + 1]

                    ]


                    setTemplates(

                      templates.map(
                        t =>

                          t.id ===
                          template.id

                            ?

                            {

                              ...t,

                              exercises:
                                reordered

                            }

                            :

                            t

                      )

                    )

                  }}
                >

                  ⬇️

                </button>



                <button
                    style={iconButton}

                  onClick={() => {

                    const group =

                      prompt(
                        "Superset group (A, B, etc). Leave empty to clear."
                      )


                    setTemplates(

                      templates.map(
                        t =>

                          t.id ===
                          template.id

                            ?

                            {

                              ...t,

                              exercises:

                                t.exercises.map(
                                  ex =>

                                    ex.id ===
                                    exercise.id

                                      ?

                                      {

                                        ...ex,

                                        supersetGroup:

                                          group

                                          ||

                                          null

                                      }

                                      :

                                      ex
                                )

                            }

                            :

                            t

                      )

                    )

                  }}

                >

                  {

                    exercise.supersetGroup

                      ?

                      `🔗 ${exercise.supersetGroup}`

                      :

                      "🔗"

                  }

                </button>



                <button
                    style={iconButton}

                  onClick={() => {

                    setTemplates(

                      templates.map(
                        t =>

                          t.id ===
                          template.id

                            ?

                            {

                              ...t,

                              exercises:

                                t.exercises.filter(
                                  ex =>

                                    ex.id !==
                                    exercise.id
                                )

                            }

                            :

                            t

                      )

                    )

                  }}

                >

                  🗑

                </button>
                
                </div>

            </h3>
              {

                exercise.sets.map(
                  set => (

                   <div
                      key={
                        set.id
                      }
                    >

                      🎯

                      {" "}

                      {
                        set.targetWeight
                      }

                      ×

                      {
                        set.targetReps
                      }

                      {

                          (set.targetRir || set.rir)

                            ? ` @ ${set.targetRir || set.rir}`

                          : ""

                      }

                    </div>

                  ))

              }

            </div>

          ))

      }

    </div>

  )

}