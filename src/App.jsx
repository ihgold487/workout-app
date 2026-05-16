import { useState, useEffect } from "react"

const seedExercises = [
  { id: 1, name: "Bench Press", lastWeight: "135", lastReps: "8" },
  { id: 2, name: "Squat", lastWeight: "185", lastReps: "5" },
  { id: 3, name: "Lat Pulldown", lastWeight: "120", lastReps: "10" }
]

function App() {

  const [templates, setTemplates] = useState(
    () =>
      JSON.parse(
        localStorage.getItem("templates")
      ) || []
  )


  const [exerciseLibrary, setExerciseLibrary] =
    useState(
      () =>
        JSON.parse(
          localStorage.getItem(
            "exerciseLibrary"
          )
        ) || seedExercises
    )


  const [selectedTemplateId,
    setSelectedTemplateId] =
    useState(null)


  const [manageExercises,
    setManageExercises] =
    useState(false)


  const [showAddExercise,
    setShowAddExercise] =
    useState(false)


  const [search,
    setSearch] =
    useState("")



  useEffect(() => {

    localStorage.setItem(
      "templates",

      JSON.stringify(
        templates
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
      exerciseLibrary
    ]
  )



  const selectedTemplate =
    templates.find(
      t =>
        t.id ===
        selectedTemplateId
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

        exercises: []
      }

    ])

  }



  function addLibraryExercise() {

    const name =
      prompt(
        "Exercise name"
      )

    if (!name)
      return


    setExerciseLibrary([

      ...exerciseLibrary,

      {
        id:
          Date.now(),

        name,

        lastWeight: "",
        lastReps: ""
      }

    ])

  }



  function addExerciseToTemplate(
    exercise
  ) {

    const weight =
      prompt(
        `Target weight
Last:
${exercise.lastWeight}`
      )


    const reps =
      prompt(
        `Target reps
Last:
${exercise.lastReps}`
      )


    const numSets =
      prompt(
        "Number sets"
      )


    const sets = []


    for (
      let i = 0;
      i < Number(numSets);
      i++
    ) {

      sets.push({

        id:
          Date.now() + i,

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

              exercises: [

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


    setSearch("")
    setShowAddExercise(false)

  }



  function deleteExercise(
    exerciseId
  ) {

    setTemplates(

      templates.map(
        template =>

          template.id ===
            selectedTemplateId

            ?

            {

              ...template,

              exercises:

                template.exercises
                  .filter(
                    ex =>
                      ex.id !==
                      exerciseId
                  )

            }

            :

            template

      )

    )

  }



  // ------------------
  // Exercise library
  // ------------------

  if (
    manageExercises
  ) {

    return (

      <div
        style={{
          padding:
            "20px"
        }}
      >

        <button
          onClick={() =>
            setManageExercises(
              false
            )
          }
        >

          ← Back

        </button>



        <h1>

          Exercise Library

        </h1>



        <button
          onClick={
            addLibraryExercise
          }
        >

          + Add Exercise

        </button>



        <ul>

          {
            exerciseLibrary.map(
              ex => (

              <li
                key={
                  ex.id
                }
              >

                {ex.name}

              </li>

            ))
          }

        </ul>

      </div>

    )

  }



  // ------------------
  // Template screen
  // ------------------

  if (
    selectedTemplate
  ) {

    const filtered =

      exerciseLibrary.filter(
        e =>

          e.name
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



        <h1>

          {
            selectedTemplate.name
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

          <>

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
                exercise => (

                <div
                  key={
                    exercise.id
                  }
                >

                  <button

                    onClick={() =>

                      addExerciseToTemplate(
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

          </>

        }



        <hr />



        {

          selectedTemplate
            .exercises
            .map(
              ex => (

              <div
                key={
                  ex.id
                }
              >

                <h3>

                  {ex.name}


                  {" "}


                  <button

                    onClick={() =>

                      deleteExercise(
                        ex.id
                      )

                    }

                  >

                    Delete

                  </button>

                </h3>



                {

                  ex.sets.map(
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



  // ------------------
  // Home screen
  // ------------------

  return (

    <div
      style={{
        padding:
          "20px"
      }}
    >

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



      <button
        onClick={() =>

          setManageExercises(
            true
          )

        }
      >

        Manage Exercises

      </button>



      <hr />



      {

        templates.map(
          template => (

          <div
            key={
              template.id
            }
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