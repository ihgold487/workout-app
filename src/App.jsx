import { useState, useEffect } from "react"

const seedExercises = [
  { id: 1, name: "Bench Press" },
  { id: 2, name: "Squat" },
  { id: 3, name: "Lat Pulldown" }
]

function App() {

  const [templates, setTemplates] =
    useState(
      () =>
        JSON.parse(
          localStorage.getItem("templates")
        ) || []
    )

  const [exerciseLibrary,
    setExerciseLibrary] =
    useState(
      () =>
        JSON.parse(
          localStorage.getItem(
            "exerciseLibrary"
          )
        ) || seedExercises
    )

  const [sessions,
    setSessions] =
    useState(
      () =>
        JSON.parse(
          localStorage.getItem(
            "sessions"
          )
        ) || []
    )

  const [selectedTemplateId,
    setSelectedTemplateId] =
    useState(null)

  const [selectedSessionId,
    setSelectedSessionId] =
    useState(null)

  const [search,
    setSearch] =
    useState("")

  const [showAddExercise,
    setShowAddExercise] =
    useState(false)



  useEffect(() => {

    localStorage.setItem(
      "templates",
      JSON.stringify(
        templates
      )
    )

    localStorage.setItem(
      "sessions",
      JSON.stringify(
        sessions
      )
    )

    localStorage.setItem(
      "exerciseLibrary",
      JSON.stringify(
        exerciseLibrary
      )
    )

  },
    [
      templates,
      sessions,
      exerciseLibrary
    ]
  )



  const selectedTemplate =
    templates.find(
      t =>
      t.id ===
      selectedTemplateId
    )


  const selectedSession =
    sessions.find(
      s =>
      s.id ===
      selectedSessionId
    )



  function addTemplate() {

    const name =
      prompt(
        "Template name"
      )

    if (!name)
      return


    setTemplates([

      ...templates,

      {
        id:
          Date.now(),

        name,

        exercises:[]
      }

    ])

  }



  function addExerciseToTemplate(
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
      prompt(
        "Number sets"
      )


    const sets=[]

    for(
      let i=0;
      i<Number(numSets);
      i++
    ){

      sets.push({

        id:
          Date.now()+i,

        targetWeight:
          weight,

        targetReps:
          reps

      })

    }



    setTemplates(

      templates.map(
        template =>

        template.id ===
        selectedTemplateId

        ?

        {

          ...template,

          exercises:[

            ...template.exercises,

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

        template

      )

    )


    setShowAddExercise(false)
    setSearch("")

  }



  function startWorkout() {

    const session = {

      id:
        Date.now(),

      templateName:
        selectedTemplate.name,

      exercises:

      selectedTemplate.exercises
      .map(
        ex => ({

          ...ex,

          sets:

          ex.sets.map(
            set => ({

              ...set,

              actualWeight:"",
              actualReps:""

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



// SESSION VIEW

if (selectedSession) {

  return (

    <div style={{ padding: "20px" }}>

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
          selectedSession
          .templateName
        }

      </h1>



      {

        selectedSession
        .exercises
        .map(
          ex => (

          <div
            key={ex.id}
            style={{
              marginBottom:
              "20px"
            }}
          >

            <h3>

              {ex.name}

            </h3>



            {

              ex.sets.map(
                set => (

                <div
                  key={set.id}
                  style={{
                    marginBottom:
                    "10px"
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

                    placeholder="wt"

                    value={
                      set.actualWeight
                      || ""
                    }

                    onChange={
                      e => {

                        setSessions(

                          sessions.map(
                            session =>

                            session.id ===
                            selectedSessionId

                            ?

                            {

                              ...session,

                              exercises:

                              session.exercises
                              .map(
                                exercise =>

                                exercise.id ===
                                ex.id

                                ?

                                {

                                  ...exercise,

                                  sets:

                                  exercise.sets
                                  .map(
                                    s =>

                                    s.id ===
                                    set.id

                                    ?

                                    {

                                      ...s,

                                      actualWeight:
                                      e.target.value

                                    }

                                    :

                                    s

                                  )

                                }

                                :

                                exercise

                              )

                            }

                            :

                            session

                          )

                        )

                      }

                    }

                  />


                  ×


                  <input

                    placeholder="reps"

                    value={
                      set.actualReps
                      || ""
                    }

                    onChange={
                      e => {

                        setSessions(

                          sessions.map(
                            session =>

                            session.id ===
                            selectedSessionId

                            ?

                            {

                              ...session,

                              exercises:

                              session.exercises
                              .map(
                                exercise =>

                                exercise.id ===
                                ex.id

                                ?

                                {

                                  ...exercise,

                                  sets:

                                  exercise.sets
                                  .map(
                                    s =>

                                    s.id ===
                                    set.id

                                    ?

                                    {

                                      ...s,

                                      actualReps:
                                      e.target.value

                                    }

                                    :

                                    s

                                  )

                                }

                                :

                                exercise

                              )

                            }

                            :

                            session

                          )

                        )

                      }

                    }

                  />

                </div>

              ))

            }

          </div>

        ))

      }

    </div>

  )

}


  // TEMPLATE VIEW

  if(
    selectedTemplate
  ){

    const filtered =

    exerciseLibrary.filter(
      ex =>

      ex.name
      .toLowerCase()

      .includes(
        search
        .toLowerCase()
      )
    )



    return(

      <div style={{
        padding:"20px"
      }}>

        <button
        onClick={() =>
        setSelectedTemplateId(
          null
        )}
        >

        ← Back

        </button>


        <h1>

        {
        selectedTemplate.name
        }

        </h1>



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
          marginTop:"20px",
          border:
          "1px solid #ccc",
          padding:"10px"
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

          filtered.map(
          ex => (

          <div
          key={ex.id}
          style={{
          marginTop:"10px"
          }}
          >

            <button
            onClick={() =>
            addExerciseToTemplate(
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



        <hr/>



        {

        selectedTemplate
        .exercises
        .map(
        ex => (

        <div
        key={ex.id}
        >

          <h3>

          {
          ex.name
          }

          </h3>


          {

          ex.sets.map(
          set => (

          <div
          key={set.id}
          >

          Target:

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



  return(

    <div style={{
      padding:"20px"
    }}>

      <h1>

      Workout Log

      </h1>


      <button
      onClick={
      addTemplate
      }
      >

      + New Template

      </button>



      {

      templates.map(
      template => (

      <div
      key={template.id}
      >

      <button
      onClick={() =>
      setSelectedTemplateId(
        template.id
      )
      }
      >

      {
      template.name
      }

      </button>

      </div>

      ))

      }

    </div>

  )

}

export default App