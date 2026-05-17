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

  const [showAdd, setShowAdd] =
    useState(false)



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

  }



  const filteredExercises =

    exerciseLibrary.filter(
      exercise =>

        exercise.name
        .toLowerCase()

        .includes(

          search
          .toLowerCase()

        )
    )



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

        showAdd &&

        <div
          style={{
            marginTop:
              "20px",

            border:
              "1px solid #ccc",

            padding:
              "10px"
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
              exercise => (

                <div
                  key={
                    exercise.id
                  }

                  style={{
                    marginTop:
                      "10px"
                  }}
                >

                  <button

                    onClick={() =>
                      addExercise(
                        exercise
                      )
                    }

                  >

                    {
                      exercise.name
                    }

                  </button>

                </div>

              ))

          }

        </div>

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


                  if (
                    index <= 0
                  )
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



              {" "}


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