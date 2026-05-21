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
      sets:""

    })



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
            reps

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
            .muscleGroup

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
            e =>

              e.muscleGroup
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
          key={exercise.id}

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
              exercise.name
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
            pendingExercise.name
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

             <h3>

              {
                exercise.name
              }


              {" "}


                <button
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

                  ↑

                </button>



                <button
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

                  ↓

                </button>



                <button

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

                      `Set ${exercise.supersetGroup}`

                      :

                      "Superset"

                  }

                </button>



                <button

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

                                      note:
                                        e.target.value

                                    }

                                    :

                                    ex
                              )

                          }

                          :

                          t

                    )

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

                    </div>

                  ))

              }

            </div>

          ))

      }

    </div>

  )

}